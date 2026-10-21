import E from "../apply/engine.js";
import type { Facts } from "./facts.ts";
import type { Preferences } from "./preferences.ts";
import type { JobPost } from "./sources.ts";
import { monthlyUsd } from "./text.ts";

export type Eligibility = "worldwide" | "region" | "local" | "visa" | "restricted" | "unknown";

export type Fit = {
  score: number;
  band: "strong" | "good" | "maybe";
  eligibility: Eligibility;
  payMonthlyUsd: number | null;
  track: string;
  matched: string[];
  gaps: string[];
  reasons: string[];
  flags: string[];
  hidden: string | null;
};

const DAY = 86_400_000;
const OPEN = /^(worldwide|anywhere|anywhere in the world|global|globally|international|world)$/i;
const NEAR = /^(.*\bnigeria\b.*|africa|west africa|sub-saharan africa|emea|europe,? middle east (and|&) africa|wat|(gmt|utc) ?\+ ?1)$/i;
const place = (p: string) => p.replace(/\b(fully remote|remote|hybrid|anywhere in)\b|[-–()]/gi, " ").replace(/\s+/g, " ").trim();
const NOT_REMOTE = /\b(hybrid|on-?site|in[- ]office|office[- ]based)\b/i;
const LOCKED = /\b(must|need to|required to)\s+(be\s+)?(based|located|reside|residing|living|live)\s+in\s+(the\s+)?(us|u\.s\.|usa|united states|uk|united kingdom|canada|eu|europe|australia)\b|\b(us|usa|u\.s\.|uk|eu|canada)[- ]only\b|\bauthori[sz]ed to work in the (us|united states|uk|united kingdom)\b/i;
const VISA = /\bvisa sponsorship\b|\bsponsor (your|a|the) (work )?visa\b|\brelocation (support|package|assistance)\b|\bwe (can|will) sponsor\b/i;
const NO_VISA = /\b(no|not|unable to|cannot|can't|won't|do not|does not|don't)\s+(offer\s+|provide\s+)?(visa\s+)?sponsor/i;
const SENIOR = /\b(staff|principal|director|head of|vp|vice president|chief)\b/i;

const lower = (s: string) => s.toLowerCase();
const usd = (n: number) => "$" + n.toLocaleString("en-US");

export function eligibility(post: JobPost, prefs: Preferences): { eligibility: Eligibility; why: string } {
  const where = [post.location, ...post.restrictions].join(", ");
  const city = prefs.cities.find((c) => c && lower(where).includes(lower(c)));
  if (city) return { eligibility: "local", why: `Based in ${city}` };
  const visa = prefs.visa && VISA.test(post.description) && !NO_VISA.test(post.description);
  if (visa) return { eligibility: "visa", why: "Offers visa sponsorship or relocation" };
  if (LOCKED.test(post.description)) return { eligibility: "restricted", why: "The post says you must live in a set country" };
  if (prefs.remoteOnly && NOT_REMOTE.test(post.location) && !/\bremote\b/i.test(post.location))
    return { eligibility: "restricted", why: `Not remote: ${post.location}` };
  const places = post.restrictions.map(place).filter(Boolean);
  if (!places.length || places.some((p) => OPEN.test(p)))
    return post.location || post.source !== "greenhouse" ? { eligibility: "worldwide", why: "Open worldwide" } : { eligibility: "unknown", why: "Location not stated" };
  const near = places.find((p) => NEAR.test(p));
  if (near) return { eligibility: "region", why: `Open to ${near}` };
  return { eligibility: "restricted", why: `Open only to ${places.slice(0, 3).join(", ")}${places.length > 3 ? " and others" : ""}` };
}

export function scoreJob(post: JobPost, facts: Facts, prefs: Preferences, now = new Date()): Fit {
  const jd = `${post.title}\n${post.tags.join(", ")}\n${post.description}`;
  const a = E.analyze(jd, facts) as unknown as { track: string; scores: Record<string, number>; matched: { label: string; group: string }[]; gaps: string[] };
  const matched = [...new Set(a.matched.filter((m) => m.group !== "Working style").map((m) => m.label))];
  const where = eligibility(post, prefs);
  const pay = post.pay ? monthlyUsd({ ...post.pay, min: post.pay.max }) : null;
  const ageDays = post.postedAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(post.postedAt)) / DAY)) : null;
  const reasons: string[] = [];
  const flags: string[] = [];

  const titled = Object.values(facts.tracks).some((t) => new RegExp(`\\b(?:${t.titleOk.source})`, "i").test(post.title));
  let hidden: string | null = null;
  if (!titled) hidden = "Outside your fields";
  else if (where.eligibility === "restricted") hidden = where.why;
  else if (pay !== null && pay < prefs.minMonthlyUsd) hidden = `Pays about ${usd(pay)} a month, under your ${usd(prefs.minMonthlyUsd)} floor`;

  if (matched.length) reasons.push(`Matches ${matched.length} of your skills: ${matched.slice(0, 5).join(", ")}${matched.length > 5 ? " and more" : ""}`);
  reasons.push(where.why);
  if (pay !== null) reasons.push(`Pays up to about ${usd(pay)} a month`);
  if (ageDays !== null) reasons.push(ageDays === 0 ? "Posted today" : `Posted ${ageDays} day${ageDays === 1 ? "" : "s"} ago`);

  if (ageDays !== null && ageDays > 180) flags.push("Open for over 6 months. It may be an always-open pipeline post.");
  else if (ageDays !== null && ageDays > 30) flags.push(`Posted ${ageDays} days ago. It may already be filled.`);
  if (!post.company.trim()) flags.push("No company is named.");
  if (post.description.length < 400) flags.push("Very short post with few details.");
  if (SENIOR.test(post.title)) flags.push("The title asks for a very senior level.");
  if (pay === null) flags.push("Pay is not listed. Ask early.");

  let score = Math.min(matched.length, 10) * 5;
  score += { worldwide: 20, region: 20, local: 20, visa: 15, unknown: 5, restricted: 0 }[where.eligibility];
  score += pay === null ? 5 : pay >= prefs.minMonthlyUsd ? 15 : 0;
  score += ageDays === null ? 3 : ageDays <= 3 ? 15 : ageDays <= 7 ? 10 : ageDays <= 14 ? 6 : ageDays <= 30 ? 3 : 0;
  score -= Math.min(a.gaps.length * 4, 12);
  score -= flags.filter((f) => !f.startsWith("Pay is not")).length * 5;
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    band: score >= 70 ? "strong" : score >= 50 ? "good" : "maybe",
    eligibility: where.eligibility,
    payMonthlyUsd: pay,
    track: a.track,
    matched,
    gaps: a.gaps,
    reasons,
    flags,
    hidden,
  };
}

const key = (s: string) => s.toLowerCase().replace(/\b(inc|llc|ltd|gmbh|remote)\b|[^a-z0-9]+/g, "");

export function dedupe(posts: JobPost[]): JobPost[] {
  const rank = (p: JobPost) => (["greenhouse", "ashby", "lever"].includes(p.source) ? 0 : 1);
  const best = new Map<string, JobPost>();
  for (const p of posts) {
    const k = `${key(p.company)}|${key(p.title)}`;
    const seen = best.get(k);
    if (!seen || rank(p) < rank(seen) || (rank(p) === rank(seen) && p.description.length > seen.description.length)) best.set(k, p);
  }
  return [...best.values()];
}
