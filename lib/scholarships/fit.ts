// How well a scholarship fits you, like the job fit: hidden when you can't apply,
// then scored on level, funding, deadline time and the documents you already have.

import type { DocKind } from "../grow/documents.ts";

export type ScholarshipPrefs = { levels: string[]; fundedOnly: boolean; places: string[]; country: string };
export const DEFAULT_SCHOLARSHIP_PREFS: ScholarshipPrefs = { levels: ["Master's"], fundedOnly: false, places: [], country: "Nigeria" };
export const LEVEL_CHOICES = ["Undergraduate", "Master's", "PhD", "Short course", "Internship", "Fellowship"];
// Whole words only, so "MasterCard" is not a Master's degree.
export const LEVEL_WORDS: Record<string, RegExp> = {
  Undergraduate: /\bundergraduate|\bbachelor'?s?\b|\bbsc\b/i,
  "Master's": /\bmaster'?s\b|\bmasters\b|\bmaster of\b|\bpostgraduates?\b|\bmsc\b|\bmba\b|\bllm\b/i,
  PhD: /\bph\.?d\b|\bdoctora(l|te)\b/i,
  "Short course": /\bshort course|\btraining\b|\bsummer school|\bworkshop|\bbootcamp/i,
  Internship: /\binternships?\b/i,
  Fellowship: /\bfellowships?\b/i,
};

export function cleanScholarshipPrefs(v: unknown): ScholarshipPrefs {
  const p = (v ?? {}) as Partial<Record<keyof ScholarshipPrefs, unknown>>;
  const list = (x: unknown, max: number) =>
    (Array.isArray(x) ? x : String(x ?? "").split(/[,\n]/))
      .map((s) => String(s).trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, max);
  return {
    levels: p.levels === undefined ? DEFAULT_SCHOLARSHIP_PREFS.levels : list(p.levels, 6).filter((l) => LEVEL_CHOICES.includes(l)),
    fundedOnly: Boolean(p.fundedOnly),
    places: list(p.places, 10),
    country: list(p.country, 1)[0] || DEFAULT_SCHOLARSHIP_PREFS.country,
  };
}

export type Lead = { title: string; place: string | null; eligible: string | null; level: string | null; deadline: string | null; needs: DocKind[]; fully_funded?: boolean; benefits?: string[] };
export type ScholarshipFit = { score: number; band: "strong" | "good" | "maybe"; hidden: string | null; reasons: string[] };

const OPEN_TO_ALL = /\ball\b|any countr|international|worldwide|global|developing|commonwealth/i;

export function scoreScholarship(l: Lead, prefs: ScholarshipPrefs, have: DocKind[], today: string): ScholarshipFit {
  const reasons: string[] = [];
  const e = (l.eligible ?? "").toLowerCase();
  const country = prefs.country.toLowerCase();
  const african = /africa|sub-saharan|ecowas|west africa/.test(e);
  if (l.deadline && l.deadline < today) return { score: 0, band: "maybe", hidden: "the deadline has passed", reasons };
  // Only a short list of places can rule you out; a long sentence is left for you to read.
  const shortList = e.length > 0 && e.length <= 60 && !/\d+ (eligible )?countries/.test(e);
  if (shortList && !OPEN_TO_ALL.test(e) && !e.includes(country) && !(african && /nigeria|ghana|kenya|south africa|rwanda|uganda|cameroon|senegal/.test(country)))
    return { score: 0, band: "maybe", hidden: `open to ${l.eligible} only`, reasons };
  const funded = Boolean(l.fully_funded) || /fully[- ]funded|full scholarship/i.test(`${l.title} ${(l.benefits ?? []).join(" ")}`);
  if (prefs.fundedOnly && !funded) return { score: 0, band: "maybe", hidden: "not fully funded", reasons };

  let score = 40;
  const level = `${l.level ?? ""} ${l.title}`;
  if (prefs.levels.length) {
    const hit = prefs.levels.some((x) => LEVEL_WORDS[x]?.test(level));
    const anyLevel = !l.level || /all levels|any/i.test(l.level);
    if (hit) {
      score += 25;
      reasons.push("Matches the level you want");
    } else if (!anyLevel) return { score: 0, band: "maybe", hidden: `for ${l.level}, not ${prefs.levels.join(" or ")}`, reasons };
  }
  if (e.length > 60) reasons.push("Check who can apply on the page");
  if (e.includes(country) || african) {
    score += 10;
    reasons.push(e.includes(country) ? `Open to people from ${prefs.country}` : "Open to Africans");
  }
  if (funded) {
    score += 10;
    reasons.push("Fully funded");
  }
  if (prefs.places.length && prefs.places.some((p) => (l.place ?? "").toLowerCase().includes(p.toLowerCase()) || l.title.toLowerCase().includes(p.toLowerCase()))) {
    score += 10;
    reasons.push("In a place you want");
  }
  if (l.deadline) {
    const days = Math.floor((Date.parse(l.deadline) - Date.parse(today)) / 86_400_000);
    if (days < 7) {
      score -= 10;
      reasons.push(`Only ${days} days left`);
    } else if (days >= 21) score += 5;
  }
  if (l.needs.length) {
    const ready = l.needs.filter((k) => have.includes(k)).length / l.needs.length;
    score += Math.round(ready * 10);
    if (ready === 1) reasons.push("You have every document it names");
  }
  score = Math.max(1, Math.min(100, score));
  return { score, band: score >= 75 ? "strong" : score >= 55 ? "good" : "maybe", hidden: null, reasons };
}
