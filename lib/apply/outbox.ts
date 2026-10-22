import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApplicationEvent } from "@/lib/crm/application-event";
import { applyEvent } from "@/lib/crm/apply";
import { supabaseCrmDb } from "@/lib/crm/supabase-db";
import type { Facts } from "@/lib/jobs/facts";
import { loadProfile } from "@/lib/jobs/profile";
import { open, readKey, seal } from "@/lib/mail/crypto";
import { type Contact, findContactEmail, isEmail } from "@/lib/mail/extract";
import { type MailLogin, readInbox, sendMail, testLogin } from "@/lib/mail/gmail";
import { isAutoReply, matchReply, snippet, suggestStage } from "@/lib/mail/reply";
import { followUpTimes, guessZone, inWindow, nextWindow, sendBudget, zoneTime } from "@/lib/mail/schedule";
import { cvPdf } from "@/lib/pdf/cv";
import { aiProviders, type Why, writeWhy } from "./ai";
import { attachmentName, cleanRole, draftApplication, followUps, withEmail } from "./compose";

type Db = SupabaseClient;
type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

type JobRow = {
  id: string; user_id: string; title: string; company: string; description: string; location: string; apply_url: string;
  track: string; matched: string[]; gaps: string[]; status: string; contact_email: string | null; contact_source: string | null;
  draft: (Why & { at: string }) | null;
};
type OutRow = { id: string; user_id: string; job_id: string | null; parent_id: string | null; kind: string; to_email: string; subject: string; body: string; cv_markdown: string | null; attachment_name: string | null; send_after: string };

const JOB_COLS = "id, user_id, title, company, description, location, apply_url, track, matched, gaps, status, contact_email, contact_source, draft";

export type Prepared = {
  jobId: string; contact: Contact | null; subject: string; body: string; cover: string; attachment: string;
  why: Why; problems: string[]; notes: string[]; gaps: string[]; applyUrl: string;
  person: Record<"name" | "email" | "phone" | "linkedin" | "portfolio" | "location", string>;
  sendsLater: string | null; mail: { email: string | null; tested: boolean }; outbox: { status: string; sentAt: string | null } | null;
};

// ---------- Gmail login ----------

export async function connectGmail(db: Db, userId: string, email: string, password: string): Promise<Result<object>> {
  const key = readKey();
  if (!key) return { ok: false, error: "The server has no MAIL_ENCRYPTION_KEY yet, so it can't store the password safely." };
  const address = email.trim().toLowerCase();
  const secret = password.replace(/\s+/g, "");
  if (!isEmail(address)) return { ok: false, error: "Enter your full Gmail address, like name@gmail.com." };
  if (!/^[a-z]{16}$/i.test(secret)) return { ok: false, error: "An app password is 16 letters. Copy it again from your Google account." };
  const problem = await testLogin({ email: address, password: secret });
  if (problem) return { ok: false, error: problem };
  const s = seal(secret, key);
  const { error } = await db.from("mail_accounts").upsert({ user_id: userId, email: address, secret_ciphertext: s.ciphertext, secret_iv: s.iv, secret_tag: s.tag, connected_at: new Date().toISOString(), last_uid: null, test_sent_at: null });
  return error ? { ok: false, error: "The connection worked, but it could not be saved. Try again." } : { ok: true };
}

async function loadLogin(db: Db, userId: string, name?: string): Promise<(MailLogin & { lastUid: number | null; tested: boolean }) | null> {
  const key = readKey();
  const { data } = await db.from("mail_accounts").select("email, secret_ciphertext, secret_iv, secret_tag, last_uid, test_sent_at").eq("user_id", userId).maybeSingle();
  if (!data || !key) return null;
  const password = open({ ciphertext: data.secret_ciphertext, iv: data.secret_iv, tag: data.secret_tag }, key);
  return { email: data.email, password, name, lastUid: data.last_uid, tested: Boolean(data.test_sent_at) };
}

export async function sendTestEmail(db: Db, userId: string): Promise<Result<{ to: string }>> {
  const profile = await loadProfile(db, userId);
  const login = await loadLogin(db, userId, profile?.facts.person.name);
  if (!login || !profile) return { ok: false, error: "Connect Gmail first." };
  const draft = draftApplication({ title: "Test Role", company: "Your own inbox", description: "A test of the Sales CRM apply email." }, withEmail(profile.facts, login.email), "This is a test of the email employers will get.");
  try {
    await sendMail(login, {
      to: login.email,
      subject: `[Test] ${draft.subject}`,
      text: `This is a test from your Sales CRM. Employers get emails that look like this, with your CV attached.\n\n---\n\n${draft.body}`,
      attachments: [{ filename: attachmentName(profile.facts, "test"), content: Buffer.from(await cvPdf(draft.cv, `${profile.facts.person.name} CV`)) }],
    });
  } catch {
    return { ok: false, error: "Gmail refused the test email. Reconnect Gmail with a new app password." };
  }
  await db.from("mail_accounts").update({ test_sent_at: new Date().toISOString() }).eq("user_id", userId);
  return { ok: true, to: login.email };
}

// ---------- preparing ----------

async function loadJob(db: Db, userId: string, jobId: string) {
  const { data } = await db.from("job_posts").select(JOB_COLS).eq("id", jobId).eq("user_id", userId).maybeSingle();
  return data as JobRow | null;
}

export async function prepare(db: Db, userId: string, jobId: string, opts: { oidc?: string | null; fresh?: boolean } = {}): Promise<Result<{ p: Prepared }>> {
  const job = await loadJob(db, userId, jobId);
  if (!job) return { ok: false, error: "That job was not found." };
  const profile = await loadProfile(db, userId);
  if (!profile) return { ok: false, error: "Your Profile could not be loaded." };
  const { data: account } = await db.from("mail_accounts").select("email, test_sent_at").eq("user_id", userId).maybeSingle();
  const facts = withEmail(profile.facts, account?.email);

  const contact = job.contact_email ? { email: job.contact_email, sentence: job.contact_source ?? "" } : findContactEmail(job.description);
  let why: Why;
  if (job.draft?.why && !opts.fresh) why = job.draft;
  else {
    const providers = profile.preferences.ai === "off" ? [] : aiProviders(process.env, opts.oidc);
    why = await writeWhy({ title: job.title, company: job.company, description: job.description }, facts, job.matched, providers);
    await db.from("job_posts").update({ draft: { ...why, at: new Date().toISOString() }, contact_email: contact?.email ?? null, contact_source: contact?.sentence ?? null }).eq("id", job.id);
  }
  const d = draftApplication({ title: job.title, company: job.company, description: job.description, track: job.track }, facts, why.why, why.manager);
  const zone = guessZone(job.location);
  const now = new Date();
  const { data: out } = await db.from("applications_outbox").select("status, sent_at").eq("job_id", job.id).eq("kind", "application").in("status", ["queued", "sent"]).maybeSingle();
  return {
    ok: true,
    p: {
      jobId: job.id, contact, subject: d.subject, body: d.body, cover: d.cover, attachment: attachmentName(facts, job.company),
      why, problems: d.problems, notes: d.notes, gaps: d.gaps, applyUrl: job.apply_url,
      person: { name: facts.person.name ?? "", email: facts.person.email ?? "", phone: facts.person.phone ?? "", linkedin: facts.person.linkedin ?? "", portfolio: facts.person.portfolio ?? "", location: facts.person.location ?? "" },
      sendsLater: inWindow(now, zone) ? null : zoneTime(nextWindow(now, zone), zone),
      mail: { email: account?.email ?? null, tested: Boolean(account?.test_sent_at) },
      outbox: out ? { status: out.status, sentAt: out.sent_at } : null,
    },
  };
}

export async function cvFor(db: Db, userId: string, jobId: string): Promise<{ name: string; pdf: Uint8Array } | null> {
  const job = await loadJob(db, userId, jobId);
  const profile = await loadProfile(db, userId);
  if (!job || !profile) return null;
  const { data: account } = await db.from("mail_accounts").select("email").eq("user_id", userId).maybeSingle();
  const facts = withEmail(profile.facts, account?.email);
  const d = draftApplication({ title: job.title, company: job.company, description: job.description, track: job.track }, facts, job.draft?.why ?? "", job.draft?.manager ?? "");
  return { name: attachmentName(facts, job.company), pdf: await cvPdf(d.cv, `${facts.person.name} CV`) };
}

// ---------- CRM record ----------

async function recordInCrm(db: Db, userId: string, job: JobRow, facts: Facts, docs: { cv: string; cover: string }, manager: string) {
  const { data: owner } = await db.from("workspace_members").select("role").eq("workspace_id", 1).eq("user_id", userId).eq("role", "owner").maybeSingle();
  if (owner) {
    const built = buildApplicationEvent({
      company: job.company, role: cleanRole(job.title), manager, track: facts.tracks[job.track]?.label ?? "Accessibility", contract: false,
      documents: docs, jd: job.description, matched: job.matched, gaps: job.gaps,
    });
    if (built.ok) await applyEvent(built.event, supabaseCrmDb(db));
  }
  await db.from("job_posts").update({ status: "applied", status_changed_at: new Date().toISOString() }).eq("id", job.id);
}

export async function markApplied(db: Db, userId: string, jobId: string): Promise<Result<object>> {
  const job = await loadJob(db, userId, jobId);
  const profile = await loadProfile(db, userId);
  if (!job || !profile) return { ok: false, error: "That job was not found." };
  const d = draftApplication({ title: job.title, company: job.company, description: job.description, track: job.track }, profile.facts, job.draft?.why ?? "", job.draft?.manager ?? "");
  await recordInCrm(db, userId, job, profile.facts, { cv: d.cv, cover: d.cover }, job.draft?.manager ?? "");
  return { ok: true };
}

// ---------- sending ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sentLastDay(db: Db, userId: string, now: Date): Promise<Date[]> {
  const { data } = await db.from("applications_outbox").select("sent_at").eq("user_id", userId).eq("status", "sent").neq("kind", "test").gte("sent_at", new Date(now.getTime() - 86_400_000).toISOString());
  return (data ?? []).map((r) => new Date(r.sent_at as string));
}

async function deliver(db: Db, login: MailLogin, row: OutRow): Promise<string | null> {
  let inReplyTo: string | undefined;
  if (row.parent_id) {
    const { data: parent } = await db.from("applications_outbox").select("message_id").eq("id", row.parent_id).maybeSingle();
    inReplyTo = parent?.message_id ?? undefined;
  }
  try {
    const attachments = row.cv_markdown && row.attachment_name ? [{ filename: row.attachment_name, content: Buffer.from(await cvPdf(row.cv_markdown, row.attachment_name.replace(/\.pdf$/, ""))) }] : undefined;
    const messageId = await sendMail(login, { to: row.to_email, subject: row.subject, text: row.body, attachments, inReplyTo, references: inReplyTo });
    await db.from("applications_outbox").update({ status: "sent", sent_at: new Date().toISOString(), message_id: messageId, error: null }).eq("id", row.id);
    return null;
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 300) : "Unknown error";
    await db.from("applications_outbox").update({ status: "failed", error }).eq("id", row.id);
    return error;
  }
}

async function afterSent(db: Db, userId: string, row: OutRow) {
  if (row.kind !== "application" || !row.job_id) return;
  const job = await loadJob(db, userId, row.job_id);
  const profile = await loadProfile(db, userId);
  if (!job || !profile) return;
  const manager = job.draft?.manager ?? "";
  const d = draftApplication({ title: job.title, company: job.company, description: job.description, track: job.track }, profile.facts, job.draft?.why ?? "", manager);
  await recordInCrm(db, userId, job, profile.facts, { cv: row.cv_markdown ?? d.cv, cover: d.cover }, manager);
  const sentAt = new Date();
  const [t1, t2] = followUpTimes(sentAt, guessZone(job.location));
  const [b1, b2] = followUps(profile.facts, { role: cleanRole(job.title), company: job.company, manager, matched: job.matched, sentAt });
  const subject = row.subject.startsWith("Re: ") ? row.subject : `Re: ${row.subject}`;
  await db.from("applications_outbox").insert([
    { user_id: userId, job_id: job.id, parent_id: row.id, kind: "follow_up_1", to_email: row.to_email, subject, body: b1, send_after: t1.toISOString() },
    { user_id: userId, job_id: job.id, parent_id: row.id, kind: "follow_up_2", to_email: row.to_email, subject, body: b2, send_after: t2.toISOString() },
  ]);
}

// Sends what is due, keeping to the daily limit and the gap. Stops at `deadline`.
export async function sendDue(db: Db, userId: string, now: Date, deadline: number, onlyId?: string): Promise<{ sent: number; errors: string[]; waiting: string | null }> {
  const profile = await loadProfile(db, userId);
  const login = await loadLogin(db, userId, profile?.facts.person.name);
  if (!login) return { sent: 0, errors: [], waiting: null };
  let q = db.from("applications_outbox").select("id, user_id, job_id, parent_id, kind, to_email, subject, body, cv_markdown, attachment_name, send_after").eq("user_id", userId).eq("status", "queued").lte("send_after", now.toISOString()).order("send_after").limit(15);
  if (onlyId) q = q.eq("id", onlyId);
  const { data: rows } = await q;
  const recent = await sentLastDay(db, userId, now);
  const errors: string[] = [];
  let sent = 0;
  for (const row of (rows ?? []) as OutRow[]) {
    let budget = sendBudget(recent, new Date());
    if (!budget.ok && budget.reason === "too_soon" && Date.now() + budget.waitSeconds * 1000 < deadline) {
      await sleep(budget.waitSeconds * 1000);
      budget = sendBudget(recent, new Date());
    }
    if (!budget.ok) return { sent, errors, waiting: budget.reason === "daily_limit" ? "You reached today's limit. The rest send tomorrow." : "Waiting a few seconds between emails. The rest send on the next run." };
    const error = await deliver(db, login, row);
    if (error) errors.push(error);
    else {
      sent++;
      recent.push(new Date());
      await afterSent(db, userId, row);
    }
  }
  return { sent, errors, waiting: null };
}

export async function applyByEmail(
  db: Db, userId: string, jobId: string,
  input: { to: string; subject: string; body: string; anyway: boolean; oidc?: string | null },
): Promise<Result<{ status: "sent" | "queued"; note: string }>> {
  const login = await loadLogin(db, userId);
  if (!login) return { ok: false, error: "Connect your Gmail in Profile first. The app sends from your own address." };
  if (!login.tested) return { ok: false, error: "Send yourself the test email in Profile first. It checks Gmail works before anything goes to an employer." };
  const to = input.to.trim().toLowerCase();
  if (!isEmail(to)) return { ok: false, error: "Enter the employer's email address in the Send to box." };
  if (to === login.email.toLowerCase()) return { ok: false, error: "That is your own address. Enter the employer's address." };
  const r = await prepare(db, userId, jobId, { oidc: input.oidc });
  if (!r.ok) return r;
  const p = r.p;
  if (p.outbox) return { ok: false, error: p.outbox.status === "sent" ? "You already sent this application." : "This application is already waiting to send. See the Outbox." };
  if (p.problems.length) return { ok: false, error: `Fix this first: ${p.problems[0]}` };
  const subject = input.subject.trim().slice(0, 200) || p.subject;
  const body = input.body.trim().slice(0, 20_000) || p.body;
  if (/\[[^\]\n]+\](?!\()/.test(body)) return { ok: false, error: "The email still has a [bracket] gap. Fill it in, then send." };

  const job = (await loadJob(db, userId, jobId))!;
  const profile = (await loadProfile(db, userId))!;
  const facts = withEmail(profile.facts, login.email);
  const d = draftApplication({ title: job.title, company: job.company, description: job.description, track: job.track }, facts, p.why.why, p.why.manager);
  const now = new Date();
  const zone = guessZone(job.location);
  const sendAfter = input.anyway ? now : nextWindow(now, zone);
  const { data: row, error } = await db.from("applications_outbox").insert({
    user_id: userId, job_id: jobId, kind: "application", to_email: to, subject, body: body + "\n",
    cv_markdown: d.cv, attachment_name: p.attachment, send_after: sendAfter.toISOString(), ai_note: p.why.provider ?? p.why.note ?? null,
  }).select("id").single();
  if (error || !row) return { ok: false, error: "The application could not be queued. Try again." };
  if (to !== p.contact?.email) await db.from("job_posts").update({ contact_email: to, contact_source: "You typed this address." }).eq("id", jobId);

  if (sendAfter > now) return { ok: true, status: "queued", note: `Queued. It sends at ${zoneTime(sendAfter, zone)}, inside the employer's work hours.` };
  const res = await sendDue(db, userId, now, Date.now() + 20_000, row.id);
  if (res.sent) return { ok: true, status: "sent", note: `Sent to ${to}. Follow-ups are set for 5 and 10 days from now, and stop if they reply.` };
  if (res.errors.length) return { ok: false, error: `Gmail did not send it: ${res.errors[0]}. It is marked failed in the Outbox.` };
  return { ok: true, status: "queued", note: res.waiting ?? "Queued. It sends on the next run." };
}

// ---------- replies ----------

export async function checkReplies(db: Db, userId: string): Promise<{ found: number; error?: string }> {
  const login = await loadLogin(db, userId);
  if (!login) return { found: 0 };
  const { data } = await db.from("applications_outbox").select("id, job_id, parent_id, kind, message_id, to_email").eq("user_id", userId).eq("status", "sent").neq("kind", "test").not("message_id", "is", null).gte("sent_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
  const rows = data ?? [];
  if (!rows.length) {
    await db.from("mail_accounts").update({ last_checked_at: new Date().toISOString() }).eq("user_id", userId);
    return { found: 0 };
  }
  const sent = rows.map((r) => ({ id: r.id as string, messageId: r.message_id as string, toEmail: r.to_email as string }));
  const domains = new Set(sent.map((s) => s.toEmail.split("@")[1]));
  const addresses = new Set(sent.map((s) => s.toEmail));
  let inbox;
  try {
    inbox = await readInbox(login, login.lastUid, (from) => addresses.has(from) || domains.has(from.split("@")[1]));
  } catch {
    return { found: 0, error: "Gmail would not let the app read the inbox. Check that IMAP is on." };
  }
  let found = 0;
  for (const m of inbox.messages) {
    if (isAutoReply(m)) continue;
    const s = matchReply(m, sent);
    if (!s) continue;
    const row = rows.find((r) => r.id === s.id)!;
    const root = row.kind === "application" ? row.id : row.parent_id;
    const { error } = await db.from("application_replies").insert({
      user_id: userId, job_id: row.job_id, outbox_id: root, message_id: m.messageId, from_email: m.from, subject: m.subject.slice(0, 300),
      received_at: m.receivedAt ?? new Date().toISOString(), snippet: snippet(m.text), suggested_stage: suggestStage(m.subject, m.text),
    });
    if (error) continue;
    found++;
    await db.from("applications_outbox").update({ status: "cancelled", error: "They replied, so this follow-up was cancelled." }).eq("parent_id", root).eq("status", "queued");
    if (row.job_id) await db.from("job_posts").update({ status: "replied", status_changed_at: new Date().toISOString() }).eq("id", row.job_id).in("status", ["applied", "no_reply", "saved", "new"]);
  }
  await db.from("mail_accounts").update({ last_uid: inbox.lastUid, last_checked_at: new Date().toISOString() }).eq("user_id", userId);
  return { found };
}

export async function markNoReply(db: Db, userId: string, now: Date) {
  const { data } = await db.from("applications_outbox").select("job_id").eq("user_id", userId).eq("kind", "follow_up_2").eq("status", "sent").lte("sent_at", new Date(now.getTime() - 5 * 86_400_000).toISOString());
  const ids = (data ?? []).map((r) => r.job_id).filter(Boolean);
  if (ids.length) await db.from("job_posts").update({ status: "no_reply", status_changed_at: now.toISOString() }).in("id", ids).eq("status", "applied");
}

// One pass for every connected user: replies first (so follow-ups cancel), then sends.
export async function tick(db: Db, deadline: number) {
  const { data: accounts } = await db.from("mail_accounts").select("user_id");
  const report = [];
  for (const { user_id } of accounts ?? []) {
    const replies = await checkReplies(db, user_id);
    const sends = await sendDue(db, user_id, new Date(), deadline);
    await markNoReply(db, user_id, new Date());
    report.push({ replies: replies.found, sent: sends.sent, errors: sends.errors.length + (replies.error ? 1 : 0) });
  }
  return report;
}
