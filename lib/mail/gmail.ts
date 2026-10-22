import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { ImapFlow, type MessageStructureObject } from "imapflow";
import type { Incoming } from "./reply.ts";

// Sends and reads with a Gmail app password. For local tests, MAIL_DROP_DIR saves each
// email as an .eml file instead, and MAIL_SMTP_HOST points at a catcher like Mailpit,
// so nothing leaves the machine.

export type MailLogin = { email: string; password: string; name?: string };
export type Outgoing = { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer }[]; inReplyTo?: string; references?: string };

const DROP = process.env.NODE_ENV !== "production" ? process.env.MAIL_DROP_DIR : undefined;

function transport(login: MailLogin) {
  if (DROP) return nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const host = process.env.MAIL_SMTP_HOST;
  if (host) return nodemailer.createTransport({ host, port: Number(process.env.MAIL_SMTP_PORT ?? 1025), secure: false });
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: login.email, pass: login.password }, connectionTimeout: 15_000 });
}

function imap(login: MailLogin) {
  return new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: login.email, pass: login.password }, logger: false, connectionTimeout: 15_000 });
}

export async function testLogin(login: MailLogin): Promise<string> {
  if (DROP) return "";
  try {
    await transport(login).verify();
  } catch {
    return "Gmail did not accept that app password for sending. Check the email address and paste the 16-letter app password again.";
  }
  if (process.env.MAIL_SMTP_HOST) return "";
  const client = imap(login);
  try {
    await client.connect();
    await client.logout();
    return "";
  } catch {
    return "Sending works, but Gmail blocked reading the inbox. In Gmail settings, under Forwarding and POP/IMAP, turn IMAP on.";
  }
}

export async function sendMail(login: MailLogin, m: Outgoing): Promise<string> {
  const info = await transport(login).sendMail({
    from: { name: login.name || login.email, address: login.email },
    to: m.to,
    subject: m.subject,
    text: m.text,
    attachments: m.attachments,
    inReplyTo: m.inReplyTo,
    references: m.references,
  });
  if (DROP && "message" in info && Buffer.isBuffer(info.message)) {
    await mkdir(DROP, { recursive: true });
    await writeFile(`${DROP}/${Date.now()}-${m.to.replace(/[^a-z0-9@.]/gi, "")}.eml`, info.message);
  }
  return info.messageId;
}

function textPart(node: MessageStructureObject | undefined): string | null {
  if (!node) return null;
  if (node.type === "text/plain" && node.disposition !== "attachment") return node.part ?? "1";
  for (const child of node.childNodes ?? []) {
    const found = textPart(child);
    if (found) return found;
  }
  return null;
}

async function readAll(stream: NodeJS.ReadableStream, max = 20_000): Promise<string> {
  let out = "";
  for await (const chunk of stream) {
    out += chunk.toString();
    if (out.length > max) break;
  }
  return out.slice(0, max);
}

// New inbox mail since the last check, keeping only senders that `wanted` says yes to.
export async function readInbox(login: MailLogin, lastUid: number | null, wanted: (from: string) => boolean): Promise<{ lastUid: number | null; messages: Incoming[] }> {
  if (DROP) return { lastUid, messages: [] };
  const client = imap(login);
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const messages: Incoming[] = [];
  let top = lastUid;
  try {
    let range: string | number[];
    if (lastUid) range = `${lastUid + 1}:*`;
    else {
      const found = await client.search({ since: new Date(Date.now() - 14 * 86_400_000) }, { uid: true });
      range = Array.isArray(found) ? found.slice(-300) : [];
    }
    if (Array.isArray(range) && !range.length) return { lastUid, messages };
    const picks: { uid: number; m: Incoming; part: string | null }[] = [];
    for await (const msg of client.fetch(range, { uid: true, envelope: true, bodyStructure: true, headers: ["in-reply-to", "references", "auto-submitted"] }, { uid: true })) {
      if (lastUid && msg.uid <= lastUid) continue;
      top = Math.max(top ?? 0, msg.uid);
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? "";
      if (!from || from === login.email.toLowerCase() || !wanted(from)) continue;
      const head = msg.headers?.toString() ?? "";
      const header = (name: string) => head.match(new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\r?\\n\\S|$)`, "im"))?.[1].replace(/\s+/g, " ").trim();
      picks.push({
        uid: msg.uid,
        part: textPart(msg.bodyStructure),
        m: {
          messageId: msg.envelope?.messageId ?? `uid-${msg.uid}`,
          from,
          subject: msg.envelope?.subject ?? "",
          text: "",
          inReplyTo: header("in-reply-to") ?? msg.envelope?.inReplyTo,
          references: (header("references") ?? "").split(/\s+/).filter(Boolean),
          autoSubmitted: header("auto-submitted"),
          receivedAt: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : undefined,
        } as Incoming,
      });
    }
    for (const p of picks.slice(0, 40)) {
      if (p.part) {
        const d = await client.download(String(p.uid), p.part, { uid: true });
        if ("content" in d && d.content) p.m.text = await readAll(d.content);
      }
      messages.push(p.m);
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return { lastUid: top, messages };
}
