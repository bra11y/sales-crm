// Scholarship search, like the job finder: read the RSS feeds of scholarship listing sites
// (their robots.txt allows it), keep real opportunities, and read the fields we score on.
// Each listing links back to its own page, which links to the official one.

import { needsFromText, type DocKind } from "../grow/documents.ts";
import { decodeEntities } from "../jobs/text.ts";
import { parseDeadline } from "../import/whatsapp.ts";

export type Feed = { id: string; name: string; home: string; url: string; pages: number; details: boolean };

export const FEEDS: Feed[] = [
  { id: "scholarshipregion", name: "Scholarship Region", home: "https://www.scholarshipregion.com", url: "https://www.scholarshipregion.com/feed/", pages: 3, details: true },
  {
    id: "opportunitiesforafricans",
    name: "Opportunities For Africans",
    home: "https://www.opportunitiesforafricans.com",
    url: "https://www.opportunitiesforafricans.com/feed/",
    pages: 3,
    details: false,
  },
  { id: "scholars4dev", name: "Scholars4Dev", home: "https://www.scholars4dev.com", url: "https://www.scholars4dev.com/feed/", pages: 1, details: false },
  { id: "opportunitydesk", name: "Opportunity Desk", home: "https://opportunitydesk.org", url: "https://opportunitydesk.org/feed/", pages: 2, details: false },
];
export const FEED_NAMES: Record<string, string> = { ...Object.fromEntries(FEEDS.map((f) => [f.id, f.name])), whatsapp: "Your WhatsApp groups", you: "Added by you" };

export type FeedItem = { title: string; url: string; published: string | null; categories: string[]; summary: string };

export type Found = {
  title: string;
  url: string;
  place: string;
  eligible: string;
  level: string;
  benefits: string[];
  needs: DocKind[];
  deadline: string | null;
  deadlineText: string;
  sharedAt: string | null;
  fullyFunded: boolean;
  summary: string;
};

const text = (s: string) =>
  decodeEntities(
    s
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

export function parseFeed(xml: string): FeedItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const get = (tag: string) => it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";
    const date = Date.parse(text(get("pubDate")));
    return {
      title: text(get("title")),
      url: text(get("link")),
      published: Number.isFinite(date) ? new Date(date).toISOString().slice(0, 10) : null,
      categories: [...it.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((m) => text(m[1])),
      summary: text(get("content:encoded") || get("description"))
        .replace(/The post [\s\S]* appeared first on [\s\S]*$/, "")
        .slice(0, 3000),
    };
  });
}

// Round-ups, how-to articles and blog posts are not opportunities you can apply to.
export function isOpportunity(i: FeedItem): boolean {
  if (!/^https:\/\//.test(i.url) || !i.title) return false;
  if (/^(top \d+|\d{1,3}\+? |how to|why |what |list of|tips)/i.test(i.title)) return false;
  if (i.categories.some((c) => /^(our blog|list of|list of scholarships|blog|news)$/i.test(c)) && !/scholarship|fellowship|internship|grant|programme|program|award/i.test(i.title)) return false;
  return /scholarship|fellowship|internship|grant|programme|program|award|bursary|studentship|training|competition|challenge|exchange|summer school|mba|masters|phd|accelerator/i.test(
    `${i.title} ${i.categories.join(" ")}`,
  );
}

const LEVELS: [string, RegExp][] = [
  ["PhD", /\bph\.?d|doctoral|doctorate/i],
  ["Master's", /\bmasters?'?s?\b|postgraduate|\bmba\b|\bmsc\b/i],
  ["Undergraduate", /undergraduate|bachelor'?s?|\bbsc\b/i],
  ["Internship", /internship/i],
  ["Fellowship", /fellowship/i],
  ["Short course", /short course|training|summer school|workshop|bootcamp|programme for young|accelerator/i],
];

export function levelOf(s: string): string {
  return LEVELS.filter(([, re]) => re.test(s))
    .map(([l]) => l)
    .slice(0, 3)
    .join(", ");
}

// "Scholarship in USA", "in the UK", "Scholarships in Germany" -> the place.
export function placeOf(title: string, categories: string[]): string {
  const cat = categories.map((c) => c.match(/^scholarships in (.+)$/i)?.[1]).find(Boolean);
  if (cat) return cat;
  const m = title.match(
    /\b(?:in|at)\s+(?:the\s+)?(UK|USA|US|Canada|Germany|France|Netherlands|Australia|Japan|China|Korea|South Korea|Italy|Spain|Sweden|Ireland|Switzerland|Belgium|Hungary|Turkey|New Zealand|Singapore|Europe|Africa|Nigeria|Ghana|Kenya|South Africa|Rwanda|Norway|Denmark|Finland|Austria|Poland|Taiwan|Hong Kong|Dubai|UAE|Saudi Arabia|Qatar)\b/i,
  );
  return m ? m[1] : "";
}

const FIELD = (body: string, names: string[]) => {
  for (const n of names) {
    const m = body.match(new RegExp(`(?:^|\\n)\\s*\\*?${n}\\*?\\s*:\\s*(.+)`, "i"));
    if (m) return m[1].replace(/\*/g, "").trim().slice(0, 200);
  }
  return "";
};

export function toFound(i: FeedItem, page = ""): Found {
  const body = `${i.summary}\n${page}`;
  const deadlineText = FIELD(body, ["Application Deadline", "Deadline", "Closing Date"]).slice(0, 80);
  const benefitsBlock = body.match(/Benefits?\s*:?\s*\n((?:.*\n){1,8})/i)?.[1] ?? "";
  return {
    title: i.title.slice(0, 200),
    url: i.url,
    place: (FIELD(body, ["Host Countr(?:y|ies)", "Host University", "Location", "Study in"]) || placeOf(i.title, i.categories)).slice(0, 200),
    eligible:
      FIELD(body, ["Eligible Countr(?:y|ies)", "Eligible Nationalities", "Eligibility"]).slice(0, 200) || (/african/i.test(i.title) ? "African countries" : /nigerian/i.test(i.title) ? "Nigeria" : ""),
    level: (FIELD(body, ["Scholarship For", "Course Level", "Level of Study", "Degree Level"]) || levelOf(`${i.title} ${i.categories.join(" ")}`)).slice(0, 120),
    benefits: benefitsBlock
      .split("\n")
      .map((l) => l.replace(/^[\s*•-]+/, "").trim())
      .filter((l) => l.length > 3 && !/:$/.test(l))
      .slice(0, 6),
    needs: needsFromText(body),
    deadline: parseDeadline(deadlineText),
    deadlineText,
    sharedAt: i.published,
    fullyFunded: /fully[- ]funded|full scholarship|full tuition/i.test(body + i.title),
    summary: i.summary.slice(0, 1000),
  };
}
