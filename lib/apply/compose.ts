// Turns a job post and the Profile into the exact email that gets sent:
// subject, body (the cover letter), the CV, and the two follow-ups.
// Everything comes from the rule engine and the Profile. Only `why` may come from AI.

import E from "./engine.js";
import type { Facts, Proof } from "../jobs/facts.ts";
import { pickProof, proofBlock } from "./proof.ts";

export type JobForDraft = { title: string; company: string; description: string; track?: string };
export type Draft = { shape: string; cv: string; cover: string; subject: string; body: string; track: string; matched: string[]; gaps: string[]; problems: string[]; notes: string[]; proof: Proof[] };

type Analysis = { track: string; matched: { label: string; group: string }[]; gaps: string[] };

export const cleanRole = (role: string) =>
  role
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+[-|–]\s+(remote|hybrid|contract|freelance|part[- ]time|full[- ]time).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

const unlink = (s: string) => s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2");

// Past employers' names, like "Lotus" from "Lotus Laboratories Inc. (assistive technology, USA)".
// Your own business is yours to name.
export function employerNames(facts: Facts): string[] {
  const own = (facts.person.business ?? "").toLowerCase();
  const names = new Set<string>();
  for (const j of facts.jobs ?? []) {
    const full = (j.org ?? "").split(/[(|]/)[0].replace(/[,.]?\s*(Inc|LLC|Ltd|Limited|PLC|GmbH)\.?\s*$/i, "").trim();
    if (!full || (own && own.includes(full.toLowerCase().split(/\s+/)[0]))) continue;
    names.add(full);
    // The short name too ("Lotus"), unless it is a word of your own name.
    const first = full.split(/\s+/)[0];
    const mine = (facts.person.name ?? "").toLowerCase().split(/\s+/);
    if (first.length >= 4 && !mine.includes(first.toLowerCase())) names.add(first);
  }
  return [...names];
}

// Messages talk about the work, not where it was done: any sentence naming a past employer is
// dropped. Their names and results stay in the CV, which goes with the email.
export function unnamed(text: string, facts: Facts): string {
  const names = employerNames(facts);
  if (!names.length) return text;
  const hit = new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`);
  return text
    .split("\n")
    .map((line) => {
      if (!hit.test(line)) return line;
      if (/^\s*-\s/.test(line)) return null;
      const kept = (line.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [line]).filter((s) => !hit.test(s)).join("").trim();
      return kept || null;
    })
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function withEmail(facts: Facts, email?: string): Facts {
  return email ? { ...facts, person: { ...facts.person, email } } : facts;
}

export type ReadCheck = { word: string; tag: string; subject: boolean; sentence: string };
export const findReadCheck = (description: string) => E.readCheck(description) as ReadCheck | null;

const SIGNOFF = /^(Warm regards|Best regards|Best|Kind regards|Regards|Thanks|Thank you),?$/;

// The line that shows the post was read, in the post's own words.
export const readLine = (c: { word: string; tag: string }) => `P.S. I read the whole post: ${[c.word, c.tag && `#${c.tag}`].filter(Boolean).join(" ")}`;

// Puts the line just above the sign-off (or at the end), once.
export function withReadLine(text: string, c: { word: string; tag: string }): string {
  const line = readLine(c);
  if (text.includes(line)) return text;
  const lines = text.split("\n");
  const at = lines.findIndex((l) => SIGNOFF.test(l.trim()));
  if (at < 0) return `${text.trimEnd()}\n\n${line}\n`;
  lines.splice(at, 0, line, "");
  return lines.join("\n");
}

// True when the email has the word and tag the post asked for.
export const hasReadLine = (text: string, c: { word: string; tag: string }) => (!c.word || text.includes(c.word)) && (!c.tag || text.includes(c.tag));

// The cover letter minus its letterhead, as plain text for the email body.
export function emailBody(cover: string, proof = ""): string {
  const lines = cover.replace(/^<!--[\s\S]*?-->\s*/, "").split("\n");
  const start = lines.findIndex((l) => /^(Hi|Dear|Hello)\b/.test(l.trim()));
  const body = (start >= 0 ? lines.slice(start) : lines).map((l) =>
    unlink(l)
      .replace(/\*\*/g, "")
      .replace(/^#+\s*/, ""),
  );
  // The work list ends with the portfolio, so the letter's own portfolio line goes.
  if (proof) body.splice(0, body.length, ...body.filter((l) => !/^My work: https?:\/\//.test(l.trim())));
  const close = body.findIndex((l) => SIGNOFF.test(l.trim()));
  if (close > 0) body.splice(close, 0, ...(proof ? [proof, ""] : []), "My CV is attached.", "");
  return (
    body
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

// Subject lines as plain statements that name the role (statements beat questions in reply data).
// A recruiter's first name goes up front when the post gives one.
export function subjectLine(role: string, company: string, name: string, first: string, n: number): string {
  if (first) return `${first}, my application for the ${role} role`;
  const lines = [`Application: ${role} | ${name}`, `${role} application from ${name}`, company ? `${name} for the ${role} role at ${company}` : `${name}: ${role} application`];
  return lines[n % lines.length];
}

export function draftApplication(job: JobForDraft, facts: Facts, why: string, manager = "", opts: { shape?: string; seed?: number } = {}): Draft {
  // The company's own name is not a skill the post asks for ("About Paystack" is not a
  // request for Paystack experience), so it is hidden while the post is matched.
  const own = job.company.trim();
  const jd = `${job.title}\n\n${job.description}`;
  const masked = own.length >= 3 ? jd.replace(new RegExp(`\\b${own.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "the company") : jd;
  const a = E.analyze(masked, facts) as unknown as Analysis;
  if (job.track && facts.tracks[job.track]) a.track = job.track;
  const role = cleanRole(job.title);
  // The recruiter the post names is greeted by name when none was typed in.
  const contact = manager ? null : (a as unknown as { guess?: { contact?: { name: string; first: string } | null } }).guess?.contact;
  const o = { jd: masked, company: job.company, role, manager: manager || contact?.name || "", why, ...opts };
  const n = E.seedOf(`${job.company}|${role}|${opts.seed ?? 0}`) as number;
  const cv = E.makeCV(a, o, facts) as string;
  const cover = E.makeCover(a, o, facts) as string;
  const notes = [...(E.lint(cv) as string[]).map((w) => `CV: ${w}`), ...(E.lint(cover) as string[]).map((w) => `Letter: ${w}`)];
  // These stop a one-click send: a gap still in [brackets], or no company to address.
  const problems = notes.filter((n) => /\[bracket\]/.test(n));
  const matched = [...new Set(a.matched.map((m) => m.label))];
  const proof = pickProof(jd, facts.work ?? [], matched);
  if (!job.company.trim()) problems.push("The job post names no company, so the letter can't say who it is for.");
  return {
    cv,
    cover: unnamed(cover, facts),
    subject: subjectLine(role, job.company, facts.person.name, (manager || contact?.name || "").split(/\s+/)[0].replace(/^(Mr|Ms|Mrs|Miss|Dr)\.?$/, ""), n),
    shape: E.letterShape(a, o) as string,
    body: unnamed(emailBody(cover, proofBlock(proof, facts.person.portfolio)), facts),
    track: a.track,
    matched,
    proof,
    gaps: a.gaps,
    problems,
    notes: notes.filter((n) => !problems.includes(n)),
  };
}

export function followUps(facts: Facts, opts: { role: string; company: string; manager: string; matched: string[]; sentAt: Date; proof?: Proof[] }): [string, string] {
  const greet = opts.manager || (opts.company ? `${opts.company} team` : "there");
  const date = opts.sentAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const name = facts.person.name;
  // One link they can open beats another paragraph about it.
  const link = opts.proof?.find((p) => p.url);
  const n = E.seedOf(`${opts.company}|${opts.role}`) as number;
  const pick = (a: string[], shift: number) => a[(n >>> shift) % a.length];
  const one = [
    `Hi ${greet},`,
    "",
    pick([`I applied for the ${opts.role} role on ${date} and wanted to check in.`, `I'm following up on my ${date} application for the ${opts.role} role.`], 1),
    "",
    "I'm still keen, and my offer stands: give me one small task and judge me by the result.",
    ...(link ? ["", `You can see ${link.title} here: ${link.url}`] : []),
    "",
    "Best regards,",
    name,
    "",
  ];
  const two = [
    `Hi ${greet},`,
    "",
    pick([`A last note on my application for the ${opts.role} role.`, `One last follow-up on the ${opts.role} role.`], 7),
    "",
    "If the role is filled, no need to reply. If not, I'd still love to show you what I can do. Thank you for your time.",
    "",
    "Best regards,",
    name,
    "",
  ];
  return [unnamed(one.join("\n"), facts), unnamed(two.join("\n"), facts)];
}

export function attachmentName(facts: Facts, company: string): string {
  return `${facts.person.name.replace(/[^A-Za-z0-9]+/g, "-")}-CV-${E.slug(company) || "application"}.pdf`;
}
