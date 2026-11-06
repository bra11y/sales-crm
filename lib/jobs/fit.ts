import E from "../apply/engine.js";
import type { Facts } from "./facts.ts";
import { jobLevel, LEVEL_LABEL } from "./level.ts";
import { blocked, type Preferences } from "./preferences.ts";
import type { JobPost } from "./sources.ts";
import { closingDate, longDate, monthlyUsd } from "./text.ts";

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
const place = (p: string) =>
  p
    .replace(/\b(fully remote|remote|hybrid|anywhere in|home[- ]based|work from home)\b|[-–()]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
const NOT_REMOTE = /\b(hybrid|on-?site|in[- ]office|office[- ]based)\b/i;
const LOCKED =
  /\b(must|need to|required to)\s+(be\s+)?(based|located|reside|residing|living|live)\s+in\s+(the\s+)?(us|u\.s\.|usa|united states|uk|united kingdom|canada|eu|europe|australia)\b|\b(us|usa|u\.s\.|uk|eu|canada)[- ]only\b|\bauthori[sz]ed to work in the (us|united states|uk|united kingdom)\b/i;
const VISA = /\bvisa sponsorship\b|\bsponsor (your|a|the) (work )?visa\b|\brelocation (support|package|assistance)\b|\bwe (can|will) sponsor\b/i;
const NO_VISA = /\b(no|not|unable to|cannot|can't|won't|do not|does not|don't)\s+(offer\s+|provide\s+)?(visa\s+)?sponsor/i;
const ALERT = /^(linkedin|indeed|glassdoor|seek|emailalert)$/;
const CAPTURED = "capture";
const REMOTE_BOARDS = /^(remotive|remoteok|himalayas|jobicy|weworkremotely|arbeitnow|workingnomads)$/;
const SENIOR = /\b(staff|principal|director|head of|vp|vice president|chief)\b/i;
// Everyday words that a skill list uses as a short name, but that most posts use in another
// sense ("our research team", "the payments API"). They still help the CV; they do not count
// towards the fit.
const CLOSED = /\b(this (listing|job|vacancy|position) is no longer (open|available)|applications? (are|is) (now )?closed|this job has (now )?closed)\b/i;
// Cloudflare swaps an address on the page for this text until a browser shows it.
const HIDDEN_EMAIL = /\[email(&#160;|\s)protected\]/i;
const NOT_TECH = /\b(front (desk|office)|receptionist|customer service rep|sales (rep|representative|executive)|driver|cashier)\b/i;
const LOOSE = new Set(["research", "performance", "payments", "api", "apis", "responsive", "prototype", "document", "training"]);
// Extra points when the job title is in one of your main fields, so the wide software search
// does not crowd them out.
const TITLE_BONUS: Record<string, number> = { accessibility: 15, frontend: 8, design: 8 };

const lower = (s: string) => s.toLowerCase();
const usd = (n: number) => "$" + n.toLocaleString("en-US");

// "U.S. Based" or "UK only" in the job title, which some boards leave out of the place.
const TITLE_LOCKED = /\b(u\.?s\.?a?|uk|canada|eu|europe|latam)[- ](based|only|residents?)\b|\bbased in the (us|u\.s\.|uk|united states)\b/i;
const ZONES: Record<string, number> = { wat: 1, cet: 1, cest: 2, wet: 0, bst: 1, gmt: 0, utc: 0, eet: 2, eest: 3, sast: 2, eat: 3, est: -5, edt: -4, cst: -6, mst: -7, pst: -8, ist: 5.5, aest: 10 };
const HOME_OFFSET = 1; // West Africa Time, UTC+1

// "Time zone: CET (+/- 3 hours)" or "UTC+2 ± 2h": true when your working hours fit, null when
// the place is not a time zone.
export function zoneFits(raw: string): boolean | null {
  const m = raw.match(/\b(wat|cet|cest|wet|bst|gmt|utc|eet|eest|sast|eat|est|edt|cst|mst|pst|ist|aest)\b\s*([+-−]\s*\d{1,2}(?::?30)?)?/i);
  if (!m) return null;
  const offset = ZONES[m[1].toLowerCase()] + (m[2] ? Number(m[2].replace(/[−\s]/g, (c) => (c === "−" ? "-" : "")).replace(/:?30$/, ".5")) : 0);
  const spread = Number(raw.match(/(?:\+\/?-|±)\s*(\d{1,2})\s*h/i)?.[1] ?? 2);
  return Math.abs(offset - HOME_OFFSET) <= spread;
}

export function eligibility(post: JobPost, prefs: Preferences): { eligibility: Eligibility; why: string } {
  const where = [post.location, ...post.restrictions].join(", ");
  const city = prefs.cities.find((c) => c && lower(where).includes(lower(c)));
  if (city) return { eligibility: "local", why: `Based in ${city}` };
  if (!LOCKED.test(post.description) && !TITLE_LOCKED.test(post.title) && post.restrictions.map(place).some((p) => OPEN.test(p))) return { eligibility: "worldwide", why: "Open worldwide" };
  const visa = prefs.visa && VISA.test(post.description) && !NO_VISA.test(post.description);
  if (visa) return { eligibility: "visa", why: "Offers visa sponsorship or relocation" };
  if (LOCKED.test(post.description) || TITLE_LOCKED.test(post.title)) return { eligibility: "restricted", why: "The post says you must live in a set country" };
  if (prefs.remoteOnly && NOT_REMOTE.test(post.location) && !/\bremote\b/i.test(post.location)) return { eligibility: "restricted", why: `Not remote: ${post.location}` };
  const zones = post.restrictions.map(zoneFits).filter((z) => z !== null);
  if (zones.length) return zones.some(Boolean) ? { eligibility: "region", why: `Your time zone fits: ${post.restrictions.join(", ")}` } : { eligibility: "restricted", why: `Needs a time zone far from yours: ${post.restrictions.join(", ")}` };
  const places = post.restrictions.map(place).filter(Boolean);
  if (places.some((p) => OPEN.test(p))) return { eligibility: "worldwide", why: "Open worldwide" };
  // Only remote-only boards mean "anywhere" when they name no place. A job alert email or a
  // company board that names none, or says just "Remote", may still be for one country.
  if (!places.length)
    return REMOTE_BOARDS.test(post.source) ? { eligibility: "worldwide", why: "Open worldwide" } : { eligibility: "unknown", why: "The post does not say which countries it hires from. Check before you apply." };
  const near = places.find((p) => NEAR.test(p));
  if (near) return { eligibility: "region", why: `Open to ${near}` };
  return { eligibility: "restricted", why: `Open only to ${places.slice(0, 3).join(", ")}${places.length > 3 ? " and others" : ""}` };
}

export function scoreJob(post: JobPost, facts: Facts, prefs: Preferences, now = new Date()): Fit {
  const jd = `${post.title}\n${post.tags.join(", ")}\n${post.description}`;
  const a = E.analyze(jd, facts) as unknown as { track: string; scores: Record<string, number>; matched: { label: string; group: string; said: string }[]; gaps: string[] };
  const matched = [...new Set(a.matched.filter((m) => m.group !== "Working style" && !LOOSE.has(m.said.toLowerCase())).map((m) => m.label))];
  const where = eligibility(post, prefs);
  const pay = post.pay ? monthlyUsd({ ...post.pay, min: post.pay.max }) : null;
  const ageDays = post.postedAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(post.postedAt)) / DAY)) : null;
  const reasons: string[] = [];
  const flags: string[] = [];
  const level = jobLevel(post.title, post.description);

  const titledAs = Object.entries(facts.tracks).filter(([, t]) => new RegExp(`\\b(?:${t.titleOk.source})`, "i").test(post.title)).map(([id]) => id);
  // Saved profiles may still have the older, looser title rules.
  const titled = titledAs.length > 0 && !NOT_TECH.test(post.title);
  let hidden: string | null = null;
  const skip = blocked(post.url, prefs.blockedSites) ?? blocked(post.applyUrl, prefs.blockedSites);
  const closes = closingDate(post.description);
  const today = now.toISOString().slice(0, 10);
  if (skip) hidden = `From ${skip}, a site you skip`;
  else if (CLOSED.test(post.description)) hidden = "This job has closed";
  else if (closes && closes < today) hidden = `Closed on ${longDate(closes)}`;
  else if (!titled) hidden = "Outside your fields";
  else if (where.eligibility === "restricted") hidden = where.why;
  else if (pay !== null && pay < prefs.minMonthlyUsd) hidden = `Pays about ${usd(pay)} a month, under your ${usd(prefs.minMonthlyUsd)} floor`;
  else if (!prefs.levels.includes(level.level)) hidden = `${LEVEL_LABEL[level.level]} role: ${level.why.charAt(0).toLowerCase()}${level.why.slice(1)}`;

  if (matched.length) reasons.push(`Matches ${matched.length} of your skills: ${matched.slice(0, 5).join(", ")}${matched.length > 5 ? " and more" : ""}`);
  reasons.push(where.why);
  if (closes && closes >= today) reasons.push(`Apply by ${longDate(closes)}`);
  if (level.level !== "mid") reasons.push(level.level === "entry" ? "Entry level: open to graduates" : level.why);
  if (pay !== null) reasons.push(`Pays up to about ${usd(pay)} a month`);
  if (ageDays !== null) reasons.push(ageDays === 0 ? "Posted today" : `Posted ${ageDays} day${ageDays === 1 ? "" : "s"} ago`);

  if (ageDays !== null && ageDays > 180) flags.push("Open for over 6 months. It may be an always-open pipeline post.");
  else if (ageDays !== null && ageDays > 30) flags.push(`Posted ${ageDays} days ago. It may already be filled.`);
  if (!post.company.trim()) flags.push("No company is named.");
  if (ALERT.test(post.source)) flags.push("From a job alert email, so only the title is known. Open the post to read it.");
  else if (post.source === CAPTURED) flags.push("Read from your screenshot. Check the details on the real post before you apply.");
  else if (post.description.length < 400) flags.push("Very short post with few details.");
  if (HIDDEN_EMAIL.test(post.description))
    flags.push("The site hides the email to apply to. Open the post with the extension and it reads the address from the page, so you can send from the CRM.");
  if (SENIOR.test(post.title)) flags.push("The title asks for a very senior level.");
  const moving = where.eligibility === "visa" && !/\bremote\b/i.test(post.location);
  if (moving) flags.push(`You would need to move to ${post.location || "their office"} on a work visa.`);
  if (pay === null) flags.push("Pay is not listed. Ask early.");

  let score = Math.min(matched.length, 10) * 5;
  score += { worldwide: 20, region: 20, local: 20, visa: moving ? 5 : 15, unknown: 5, restricted: 0 }[where.eligibility];
  score += Math.max(0, ...titledAs.map((id) => TITLE_BONUS[id] ?? 0));
  score += pay === null ? 5 : pay >= prefs.minMonthlyUsd ? 15 : 0;
  score += ageDays === null ? 3 : ageDays <= 3 ? 15 : ageDays <= 7 ? 10 : ageDays <= 14 ? 6 : ageDays <= 30 ? 3 : 0;
  score -= Math.min(a.gaps.length * 4, 12);
  score -= flags.filter((f) => !f.startsWith("Pay is not") && !f.startsWith("From a job alert") && !f.startsWith("Read from your") && !f.startsWith("You would need to move") && !f.startsWith("The site hides")).length * 5;
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

// "Forward Deployed Engineer - NYC" with NYC as its place is the same role as the SF one.
function withoutPlace(p: JobPost): string {
  const m = p.title.match(/^(.*\S)\s*(?:[-–|,]\s*|\()([^-–|,()]+)\)?$/);
  if (!m) return p.title;
  const where = lower([p.location, ...p.restrictions].join(" "));
  return where.includes(lower(m[2].trim())) ? m[1] : p.title;
}

export function dedupe(posts: JobPost[]): JobPost[] {
  const rank = (p: JobPost) => (["greenhouse", "ashby", "lever"].includes(p.source) ? 0 : 1);
  const best = new Map<string, JobPost>();
  for (const p of posts) {
    const k = `${key(p.company)}|${key(withoutPlace(p))}`;
    const seen = best.get(k);
    if (!seen || rank(p) < rank(seen) || (rank(p) === rank(seen) && p.description.length > seen.description.length)) best.set(k, p);
  }
  return [...best.values()];
}
