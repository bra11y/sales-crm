// Picks the proof of work that fits a job: real results with links an employer
// can open. This is what keeps an application specific and checkable.

import type { Proof } from "../jobs/facts.ts";

const has = (hay: string, word: string) => new RegExp(`(^|[^a-z0-9])${word.toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`).test(hay);

export function pickProof(jobText: string, work: Proof[], matched: string[] = [], max = 3): Proof[] {
  const lower = jobText.toLowerCase();
  const skills = matched.map((m) => m.toLowerCase());
  const scored = work.map((w, i) => {
    const text = `${w.title} ${w.what} ${w.result}`.toLowerCase();
    const score = w.tags.filter((t) => has(lower, t)).length + skills.filter((m) => text.includes(m)).length;
    return { w, i, score: score + (w.url ? 0.5 : 0) };
  });
  const fits = scored.filter((s) => s.score >= 1).sort((a, b) => b.score - a.score || a.i - b.i);
  // With nothing matching, still show the linked work, so there is always something to check.
  const pool = fits.length ? fits : scored.filter((s) => s.w.url).sort((a, b) => a.i - b.i);
  return pool.slice(0, max).map((s) => s.w);
}

export function proofLine(p: Proof): string {
  return `${p.title}: ${p.result}${p.url ? ` ${p.url}` : ""}`;
}

// The block that goes in the email, just before the sign-off.
export function proofBlock(proofs: Proof[], portfolio?: string): string {
  if (!proofs.length) return "";
  const lines = ["Work you can check:", ...proofs.map((p) => `- ${proofLine(p)}`)];
  if (portfolio && !proofs.some((p) => p.url === portfolio)) lines.push(`- More in my portfolio: ${portfolio}`);
  return lines.join("\n");
}
