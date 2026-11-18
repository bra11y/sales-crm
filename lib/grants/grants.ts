// Business grants, found like scholarships: read opportunity-site feeds, keep grants a
// business can win, read the amount, deadline and who can apply, then score each one
// for a Nigerian business. Fit is worked out when the page loads, so it is never stale.

import type { Feed, FeedItem } from "../scholarships/feeds.ts";
import { parseDeadline } from "../import/whatsapp.ts";

// Grant sections of opportunity sites. Each robots.txt allows reading the feed (checked 18 November 2026).
export const GRANT_FEEDS: Feed[] = [
  { id: "opportunitydesk-grants", name: "Opportunity Desk grants", home: "https://opportunitydesk.org", url: "https://opportunitydesk.org/category/grants/feed/", pages: 2, details: false },
  {
    id: "opportunitiesforyouth-grants",
    name: "Opportunities for Youth grants",
    home: "https://opportunitiesforyouth.org",
    url: "https://opportunitiesforyouth.org/category/grants/feed/",
    pages: 2,
    details: false,
  },
];

export const GRANT_STATUSES = ["interested", "preparing", "applied", "shortlisted", "won", "lost"] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];
export const GRANT_STATUS_LABEL: Record<GrantStatus, string> = {
  interested: "Interested",
  preparing: "Preparing",
  applied: "Applied",
  shortlisted: "Shortlisted",
  won: "Won",
  lost: "Not this time",
};

export type Grant = {
  id: string;
  name: string;
  provider: string | null;
  url: string | null;
  business: string | null;
  amount: string | null;
  deadline: string | null;
  status: GrantStatus;
  note: string | null;
  applied_on: string | null;
};
export type GrantAnswer = { id: string; question: string; answer: string; business: string | null; updated_at: string };
export type GrantLead = { title: string; eligible: string | null; amount: string | null; deadline: string | null; summary: string | null };
export type GrantFit = { score: number; band: "strong" | "good" | "maybe"; hidden: string | null; reasons: string[] };

const MONEY = /(?:up to\s+)?(?:[$€£₦]|ngn\s?|usd\s?)\s?\d[\d,.]*(?:\s?(?:k|m|million|billion))?/i;
const PRIZE = /\bgrants?\b|\bfund(?:ing|s)?\b|\bprize\b|\bcompetition\b|\bchallenge\b|\baccelerator\b|\bincubat|\bpitch\b|\baward\b|\bseed capital\b|\bprogramme\b|\bprogram\b/i;
const BUSINESS = /\bbusiness(?:es)?\b|\bentrepreneur|\bstart-?ups?\b|\bsmes?\b|\bmsmes?\b|\bfounders?\b|\benterprises?\b|\bcompan(?:y|ies)\b|\binnovators?\b|\baccelerator\b|\bincubat|\bventures?\b|\bseed capital\b/i;
const NOT_BUSINESS =
  /scholarship|\bph\.?d\b|\bmaster'?s\b|undergraduate|postgraduate|internship|\bessay\b|journalis|photograph|\bfilm\b|\breport(?:ing)? on\b|story grants?|storytelling|researchers?\b|research grant|civil society|\bngos?\b|conference grant|travel grant|bursary|nursing|\bstudents?\b|\bfellows?\b|fellowship|management program|graduate programme|graduate program/i;
const ROUND_UP = /^(top \d+|\d{1,3}\+? |how to|why |what |list of|tips)/i;

export function isBusinessGrant(i: FeedItem): boolean {
  if (!/^https:\/\//.test(i.url) || !i.title || ROUND_UP.test(i.title)) return false;
  const head = `${i.title} ${i.categories.join(" ")}`;
  if (NOT_BUSINESS.test(i.title)) return false;
  return PRIZE.test(head) && BUSINESS.test(`${head} ${i.summary.slice(0, 400)}`);
}

export function amountOf(s: string): string {
  const inBrackets = s.match(/\(([^)]*\d[^)]*)\)/)?.[1] ?? "";
  const m = inBrackets.match(MONEY) ?? s.match(MONEY);
  return m ? m[0].trim().slice(0, 120) : "";
}

const FIELD = (body: string, names: string[]) => {
  for (const n of names) {
    const m = body.match(new RegExp(`(?:^|\\n)\\s*\\*?${n}\\*?\\s*:\\s*(.+)`, "i"));
    if (m) return m[1].replace(/\*/g, "").trim().slice(0, 200);
  }
  return "";
};

export type FoundGrant = { title: string; url: string; eligible: string; amount: string; deadline: string | null; deadlineText: string; sharedAt: string | null; summary: string };

export function toGrant(i: FeedItem): FoundGrant {
  const body = i.summary;
  const deadlineText = FIELD(body, ["Application Deadline", "Deadline", "Closing Date"]).slice(0, 80);
  const eligible =
    FIELD(body, ["Eligible Countr(?:y|ies)", "Eligibility", "Who can apply"]) ||
    (/nigeria/i.test(i.title) ? "Nigeria" : /africa/i.test(i.title) ? "African countries" : /commonwealth/i.test(i.title) ? "Commonwealth countries" : "");
  return {
    title: i.title.slice(0, 200),
    url: i.url,
    eligible: eligible.slice(0, 200),
    amount: amountOf(`${i.title}\n${body.slice(0, 600)}`),
    deadline: parseDeadline(deadlineText),
    deadlineText,
    sharedAt: i.published,
    summary: body.slice(0, 1000),
  };
}

// Places that limit a grant to businesses somewhere else. Africa-wide and worldwide grants are kept.
const ELSEWHERE: [string, RegExp][] = [
  ["New York", /nyc\b|new york/i],
  ["the US", /\bu\.?s\.?-based\b|\bunited states\b|\bus residents\b|\bamerican (?:small )?business/i],
  ["the UK", /\buk\b|united kingdom|\bbritish\b|\bengland\b|\bscotland\b|\blondon\b|\bbirmingham\b|\bmanchester\b/i],
  ["Europe", /\beurope(?:an)?\b|\beu\b/i],
  ["Canada", /\bcanad(?:a|ian)\b/i],
  ["Australia", /\baustralia/i],
  ["India", /\bindia\b|\bindian\b/i],
  ["Kenya", /\bkenya/i],
  ["Ghana", /\bghana/i],
  ["South Africa", /south africa/i],
  ["Egypt", /\begypt/i],
];
const OPEN_HERE = /nigeria|\bafrica|west africa|ecowas|worldwide|\bglobal\b|international (?:applicants|founders|entrepreneurs|startups|businesses)|any country|all countries|developing countr|emerging market|commonwealth/i;

export function scoreGrant(l: GrantLead, today: string): GrantFit {
  const reasons: string[] = [];
  const who = `${l.title} ${l.eligible ?? ""}`;
  const where = `${who} ${(l.summary ?? "").slice(0, 300)}`;
  if (l.deadline && l.deadline < today) return { score: 0, band: "maybe", hidden: "the deadline has passed", reasons };
  if (!OPEN_HERE.test(where)) {
    const place = ELSEWHERE.find(([, re]) => re.test(where));
    if (place) return { score: 0, band: "maybe", hidden: `for businesses in ${place[0]} only`, reasons };
  }
  let score = 40;
  if (/nigeria/i.test(who)) {
    score += 30;
    reasons.push("Open to Nigerian businesses");
  } else if (/\bafrica|west africa|ecowas/i.test(who)) {
    score += 20;
    reasons.push("Open to African businesses");
  } else if (OPEN_HERE.test(who)) {
    score += 10;
    reasons.push("Open to many countries");
  } else reasons.push("Check who can apply on the page");
  if (/\bsmes?\b|\bmsmes?\b|small business|start-?ups?|\bfounders?\b|entrepreneur/i.test(l.title)) {
    score += 10;
    reasons.push("Made for small businesses and founders");
  }
  if (l.amount) {
    score += 5;
    reasons.push(`Pays ${l.amount}`);
  }
  if (/\bwomen\b|\bfemale\b/i.test(who)) reasons.push("Check: it may be for women-led businesses only");
  if (/\byouth\b|\byoung\b|under 3[05]/i.test(who)) reasons.push("Check the age limit");
  if (l.deadline) {
    const days = Math.round((Date.parse(l.deadline) - Date.parse(today)) / 86_400_000);
    if (days < 7) {
      score -= 10;
      reasons.push(`Only ${days} days left`);
    } else if (days >= 14) score += 5;
  }
  score = Math.max(1, Math.min(100, score));
  return { score, band: score >= 75 ? "strong" : score >= 55 ? "good" : "maybe", hidden: null, reasons };
}

export function cleanAnswer(v: { question?: unknown; answer?: unknown; business?: unknown }): { ok: true; value: { question: string; answer: string; business: string | null } } | { ok: false; error: string } {
  const question = String(v.question ?? "").trim().slice(0, 300);
  const answer = String(v.answer ?? "").trim().slice(0, 4000);
  const business = String(v.business ?? "").trim().slice(0, 120) || null;
  if (!question) return { ok: false, error: "Enter the question the form asks." };
  if (!answer) return { ok: false, error: "Write your answer to the question." };
  return { ok: true, value: { question, answer, business } };
}

export function sortGrants(list: Grant[]): Grant[] {
  const order: Record<GrantStatus, number> = { preparing: 0, interested: 1, shortlisted: 2, applied: 3, won: 4, lost: 5 };
  return [...list].sort((a, b) => order[a.status] - order[b.status] || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}
