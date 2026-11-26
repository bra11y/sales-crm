// Conferences you can go to for free or close to it: found every morning on opportunity sites,
// plus ones you add. Each one shows what it really costs to apply, because many "fully funded"
// summits take a fee before anyone reads your application.

import type { Feed, FeedItem } from "../scholarships/feeds.ts";
import { parseDeadline } from "../import/whatsapp.ts";

// Conference sections of opportunity sites. Each robots.txt allows reading the feed (checked 26 November 2026).
export const CONFERENCE_FEEDS: Feed[] = [
  { id: "opportunitiesforyouth-conferences", name: "Opportunities for Youth conferences", home: "https://opportunitiesforyouth.org", url: "https://opportunitiesforyouth.org/category/conferences/feed/", pages: 2, details: true },
  { id: "opportunitiescorners-conferences", name: "Opportunities Corners conferences", home: "https://opportunitiescorners.com", url: "https://opportunitiescorners.com/category/conferences/feed/", pages: 2, details: true },
];

export const CONFERENCE_STATUSES = ["found", "interested", "drafted", "applied", "accepted", "declined", "dismissed"] as const;
export type ConferenceStatus = (typeof CONFERENCE_STATUSES)[number];
export const CONFERENCE_STATUS_LABEL: Record<ConferenceStatus, string> = {
  found: "Found",
  interested: "Going for it",
  drafted: "Answers ready",
  applied: "Applied",
  accepted: "Accepted",
  declined: "Not this time",
  dismissed: "Not for me",
};

export type Question = { q: string; limit: number | null; answer: string; source?: "ai" | "you" | "rules"; note?: string };
export type Conference = {
  id: string;
  name: string;
  url: string;
  apply_url: string | null;
  place: string | null;
  dates: string | null;
  deadline: string | null;
  deadline_text: string | null;
  fee: string | null;
  covers: string | null;
  eligible: string | null;
  summary: string | null;
  warnings: string[];
  questions: Question[];
  source: string;
  status: ConferenceStatus;
  note: string | null;
  applied_on: string | null;
};

const EVENT = /\b(conference|summit|convention|congress|forum|symposium|assembly|model united nations|\bmun\b)\b/i;
const NOT_EVENT = /\b(scholarships?|masters?|ph\.?d|undergraduate|job|vacanc|internship|recruitment|elections?|nominations?|fellowship|\d+-month)\b/i;
const ROUND_UP = /^(top \d+|\d{1,3}\+? |how to|why |what |list of|tips)/i;

export function isConference(i: FeedItem): boolean {
  if (!/^https:\/\//.test(i.url) || !i.title || ROUND_UP.test(i.title)) return false;
  if (NOT_EVENT.test(i.title)) return false;
  return EVENT.test(i.title) || i.categories.some((c) => /^conferences?$/i.test(c));
}

const FIELD = (body: string, names: string[]) => {
  for (const n of names) {
    const m = body.match(new RegExp(`(?:^|\\n)\\s*\\*?${n}\\*?\\s*:\\s*(.+)`, "i"));
    if (m) return m[1].replace(/\*/g, "").trim().slice(0, 200);
  }
  return "";
};

const MONEY = /(?:[$€£₦]|usd\s?|gbp\s?|eur\s?)\s?\d[\d,.]*/i;
const FEE_WORDS = /\b(application|processing|registration|selection|admin(?:istrative)?|submission|evaluation|screening)\s+fee\b|\bfee\s+of\b|\bnon-?refundable\b|\bpay(?:ing)?\s+(?:a|the)\s+(?:small\s+|nominal\s+)?fee\b/i;

// The fee, with the sentence that names it, or "" when the page names none.
export function feeOf(text: string): string {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => FEE_WORDS.test(s) && MONEY.test(s)) ?? sentences.find((s) => FEE_WORDS.test(s));
  if (!hit) return "";
  const at = Math.max(0, hit.search(FEE_WORDS));
  const near = hit.length > 140 ? `${at > 60 ? "…" : ""}${hit.slice(Math.max(0, at - 60), at + 80).trim()}…` : hit.trim();
  const amount = (near.match(MONEY) ?? hit.match(MONEY))?.[0]?.replace(/[.,]$/, "");
  return (amount ? `${amount.trim()}: ${near}` : near).slice(0, 200);
}

// Signs that "fully funded" may cost you, written so you can decide before you pay.
export function warningsFor(text: string, fee: string): string[] {
  const w: string[] = [];
  if (fee) w.push(/non-?refundable/i.test(`${fee} ${text}`) ? "You pay a fee to apply, and it is not refunded if you are not picked." : "You pay a fee to apply, before anyone reads your application.");
  if (/reimburse/i.test(text)) w.push("The flight is paid back after you travel, so you need the money first.");
  if (/partial (?:air|flight|travel)/i.test(text)) w.push("Only part of the flight is covered.");
  if (/invitation letter[^.]{0,40}(?:£|\$|€|fee|cost)/i.test(text) || /(?:£|\$|€)\s?\d[^.]{0,40}invitation letter/i.test(text)) w.push("They sell invitation letters. Real funded events give them free.");
  if (/self-?funded/i.test(text)) w.push("Most seats are self-funded. Only a few carry full funding.");
  return w;
}

export type FoundConference = Omit<Conference, "id" | "status" | "note" | "applied_on" | "questions" | "source"> & { sharedAt: string | null };

const cleanTitle = (t: string) =>
  t
    .replace(/\s*[|–]\s*(?:fully funded|funded)[^|]*$/i, "")
    .replace(/\s*\((?:fully funded|funded)[^)]*\)\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim();

export function toConference(i: FeedItem, page = ""): FoundConference {
  const body = `${i.summary}\n${page}`.slice(0, 20_000);
  const title = cleanTitle(i.title);
  const deadlineText = FIELD(body, ["Application Deadline", "Deadline", "Closing Date", "Apply By"]).slice(0, 120);
  const fee = feeOf(body);
  const place =
    title.match(/\bin\s+(?:the\s+)?([A-Z][\w .'-]+?)(?:\s+\d{4}|\s*\(|$)/)?.[1]?.trim() ??
    (FIELD(body, ["Location", "Venue", "Host Country"]) || body.match(/\btake place in ([A-Z][\w'-]+(?:,? [A-Z][\w'-]+)?)/)?.[1] || "");
  const dates = FIELD(body, ["Date", "Dates", "Event Date", "Conference Date", "Summit Date"]) || body.match(/\bfrom (\d{1,2}(?:[–-]\d{1,2})? [A-Z][a-z]+ 20\d{2})/)?.[1] || "";
  return {
    name: title.slice(0, 200),
    url: i.url,
    apply_url: null,
    place: place ? place.slice(0, 120) : null,
    dates: dates.slice(0, 120) || null,
    deadline: parseDeadline(deadlineText),
    deadline_text: deadlineText || null,
    fee: fee || null,
    covers: FIELD(body, ["Benefits", "Funding", "Coverage", "Covers", "Funding Coverage"]).slice(0, 300) || (/fully funded/i.test(`${i.title} ${body.slice(0, 600)}`) ? "Says fully funded. Check what that covers." : null),
    eligible: FIELD(body, ["Eligible Countr(?:y|ies)", "Eligibility", "Who can apply", "Age"]).slice(0, 200) || null,
    summary: i.summary.slice(0, 2000) || null,
    warnings: warningsFor(body, fee),
    sharedAt: i.published,
  };
}

// The four Blessing Agbor (@Web3empresss) shared on X on 26 November 2026, read from each
// organiser's own page the same day. Their questions are kept so answers can be drafted.
export const SHARED_ON_X = "x-web3empresss-2026-11-26";
export const X_PICKS: (Omit<FoundConference, "sharedAt"> & { questions: Question[] })[] = [
  {
    name: "Human Rights Summit Canada 2027",
    url: "https://www.vfri.ca/human-rights-summit-canada-2027/",
    apply_url: "https://www.cognitoforms.com/VoiceForRightsInternational/HumanRightsSummitCanada20272",
    place: "Vancouver, Canada",
    dates: "21 to 24 May 2027",
    deadline: "2026-11-30",
    deadline_text: "30 November 2026 (no time zone given)",
    fee: "About US$26.23 plus tax. The organiser's page hides the amount; Opportunities Corners reports it.",
    covers: "20 of 150 seats: conference fee, hotel, two meals a day, and part of the flight paid back after you travel.",
    eligible: "Age 16 and up, any country. Full funding is for ages 16 to 35.",
    summary: "Run by Voice for Rights International (VFRI). Results on 25 December 2026; invitation letters 26 December to 10 January.",
    warnings: ["You pay about US$26 to apply, and the organiser's own page does not show the amount.", "The flight is paid back after you travel, so you need the money first.", "Only part of the flight is covered."],
    questions: [
      { q: "Tell us about your leadership and your work for human rights or your community.", limit: 250, answer: "" },
      { q: "Why do you want to attend, and what will you do with what you learn?", limit: 200, answer: "" },
    ],
  },
  {
    name: "New Generation Leaders Summit 2027",
    url: "https://newgenerationleaderssubmit.bwcngo.org/summits/bangkok-2027/apply",
    apply_url: "https://newgenerationleaderssubmit.bwcngo.org/summits/bangkok-2027/apply",
    place: "Bangkok, Thailand",
    dates: "23 to 25 February 2027",
    deadline: "2026-11-30",
    deadline_text: "30 November 2026 (no time zone given)",
    fee: "US$17 application fee, not refunded whatever the outcome.",
    covers: "Return flight, hotel and all sessions. Meals and visa are not mentioned.",
    eligible: "Age 18 to 40, any country.",
    summary: "Run by Better World Charity. The self-funded place costs US$500. They email the outcome.",
    warnings: ["You pay US$17 to apply, and it is not refunded if you are not picked."],
    questions: [
      { q: "Tell us about the work you do today and the community you serve.", limit: 200, answer: "" },
      { q: "Describe a time you led a change, large or small.", limit: 300, answer: "" },
      { q: "Why do you want to attend the summit, and what will you bring to the other delegates?", limit: 250, answer: "" },
      { q: "What will you do with what you learn in Bangkok in the six months after you return home?", limit: 200, answer: "" },
    ],
  },
  {
    name: "World Leaders Convention 2027",
    url: "https://theogpd.org/product/fully-funded-wlc/",
    apply_url: "https://theogpd.org/wlc-2027/",
    place: "Vienna, Austria",
    dates: "3 to 6 February 2027",
    deadline: "2026-11-29",
    deadline_text: "29 November 2026 (no time zone given)",
    fee: "About US$15.90, sold as a shop product with a quantity box. Opportunities Corners reports the amount.",
    covers: "Not stated. The page does not say what the funding pays for.",
    eligible: "Not stated.",
    summary: "Run by the Organization for Global Policy & Dialogue (OGPD), New York. Asks for a headshot (1 MB) and CV (5 MB).",
    warnings: ["The 'fully funded' place is a shop product, and the page does not say what it covers.", "No age or country rules are given."],
    questions: [
      { q: "What inspires you to participate in the World Leaders Convention 2027?", limit: 200, answer: "" },
      { q: "Which global challenge or area of leadership are you most passionate about, and why?", limit: 200, answer: "" },
    ],
  },
  {
    name: "One World Summit Japan 2027",
    url: "https://edutourismforunity.org/events-one-world-summit-japan-2027/",
    apply_url: "https://edutourismforunity.org/application-form-ows-japan-27/",
    place: "Tokyo, Japan",
    dates: "12 to 15 March 2027",
    deadline: "2026-11-30",
    deadline_text: "30 November 2026, 23:59 UK time (00:59 on 1 December in Lagos)",
    fee: "£17.99 or £18.99 to apply. The page gives both.",
    covers: "Flight support, meals, participation, invitation letter and visa support. Hotel is unclear.",
    eligible: "Age 16 to 50, any country.",
    summary: "Run by EduTourism for Unity (UK). Results 25 to 27 December 2026. Also sells £99 invitation letters and £547 self-funded places.",
    warnings: ["You pay about £18 to apply, and the page gives two different amounts.", "They sell invitation letters. Real funded events give them free."],
    questions: [
      { q: "Why do you want to attend One World Summit Japan 2027?", limit: 200, answer: "" },
      { q: "What will you share with other delegates, and how will you use what you learn?", limit: 200, answer: "" },
    ],
  },
];

export function sortConferences(list: Conference[]): Conference[] {
  const order: Record<ConferenceStatus, number> = { drafted: 0, interested: 1, found: 2, applied: 3, accepted: 4, declined: 5, dismissed: 6 };
  return [...list].sort((a, b) => order[a.status] - order[b.status] || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}

export function cleanQuestions(v: unknown): Question[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 12)
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const limit = Number(o.limit);
      const source = o.source === "ai" || o.source === "you" || o.source === "rules" ? o.source : undefined;
      return {
        q: String(o.q ?? "").trim().slice(0, 300),
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(2000, Math.round(limit)) : null,
        answer: String(o.answer ?? "").trim().slice(0, 4000),
        ...(source ? { source } : {}),
        ...(o.note ? { note: String(o.note).slice(0, 300) } : {}),
      } as Question;
    })
    .filter((q) => q.q);
}
