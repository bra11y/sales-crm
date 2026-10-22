// Turns a job post and the Profile into the exact email that gets sent:
// subject, body (the cover letter), the CV, and the two follow-ups.
// Everything comes from the rule engine and the Profile. Only `why` may come from AI.

import E from "./engine.js";
import type { Facts, Proof } from "../jobs/facts.ts";
import { pickProof, proofBlock } from "./proof.ts";

export type JobForDraft = { title: string; company: string; description: string; track?: string };
export type Draft = { cv: string; cover: string; subject: string; body: string; track: string; matched: string[]; gaps: string[]; problems: string[]; notes: string[]; proof: Proof[] };

type Analysis = { track: string; matched: { label: string; group: string }[]; gaps: string[] };

export const cleanRole = (role: string) =>
  role.replace(/\s*\([^)]*\)/g, "").replace(/\s+[-|–]\s+(remote|hybrid|contract|freelance|part[- ]time|full[- ]time).*$/i, "").replace(/\s+/g, " ").trim();

const unlink = (s: string) => s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2");

export function withEmail(facts: Facts, email?: string): Facts {
  return email ? { ...facts, person: { ...facts.person, email } } : facts;
}

// The cover letter minus its letterhead, as plain text for the email body.
export function emailBody(cover: string, proof = ""): string {
  const lines = cover.replace(/^<!--[\s\S]*?-->\s*/, "").split("\n");
  const start = lines.findIndex((l) => /^(Hi|Dear|Hello)\b/.test(l.trim()));
  const body = (start >= 0 ? lines.slice(start) : lines).map((l) => unlink(l).replace(/\*\*/g, "").replace(/^#+\s*/, ""));
  const close = body.findIndex((l) => /^(Warm regards|Best|Kind regards|Thanks),?$/.test(l.trim()));
  if (close > 0) body.splice(close, 0, ...(proof ? [proof, ""] : []), "My CV is attached as a PDF.", "");
  return body.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function draftApplication(job: JobForDraft, facts: Facts, why: string, manager = ""): Draft {
  const jd = `${job.title}\n\n${job.description}`;
  const a = E.analyze(jd, facts) as unknown as Analysis;
  if (job.track && facts.tracks[job.track]) a.track = job.track;
  const role = cleanRole(job.title);
  const o = { jd, company: job.company, role, manager, why };
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
    cover,
    subject: `Application: ${role} | ${facts.person.name}`,
    body: emailBody(cover, proofBlock(proof, facts.person.portfolio)),
    track: a.track,
    matched,
    proof,
    gaps: a.gaps,
    problems,
    notes: notes.filter((n) => !problems.includes(n)),
  };
}

function proofFor(facts: Facts, matched: string[], skip = ""): string {
  for (const label of matched) {
    const p = facts.proofs[label];
    if (p && p !== skip) return p;
  }
  const first = facts.jobs[0]?.bullets[0]?.text ?? "";
  return first && first !== skip ? first : "";
}

export function followUps(facts: Facts, opts: { role: string; company: string; manager: string; matched: string[]; sentAt: Date; proof?: Proof[] }): [string, string] {
  const greet = opts.manager || (opts.company ? `${opts.company} team` : "there");
  const date = opts.sentAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const p1 = proofFor(facts, opts.matched);
  const p2 = proofFor(facts, opts.matched.slice(1), p1) || p1;
  const name = facts.person.name;
  // One link they can open beats another paragraph about it.
  const link = opts.proof?.find((p) => p.url);
  const one = [
    `Hi ${greet},`, "",
    `I applied for the ${opts.role} role on ${date} and wanted to check in.${p1 ? ` One example of my work: ${p1}` : ""}`, "",
    ...(link ? [`You can see ${link.title} here: ${link.url}`, ""] : []),
    "I'm still keen on the role. I can send more work samples or join a short call this week.", "",
    "Best,", name, "",
  ];
  const two = [
    `Hi ${greet},`, "",
    `A last note on my application for the ${opts.role} role.${p2 ? ` ${p2}` : ""}`, "",
    "If the role is filled, no need to reply. Thank you for your time.", "",
    "Best,", name, "",
  ];
  return [one.join("\n"), two.join("\n")];
}

export function attachmentName(facts: Facts, company: string): string {
  return `${facts.person.name.replace(/[^A-Za-z0-9]+/g, "-")}-CV-${E.slug(company) || "application"}.pdf`;
}
