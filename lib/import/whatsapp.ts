import { type DocKind, needsFromText } from "../grow/documents.ts";
import type { JobPost } from "../jobs/sources.ts";
import { parsePay } from "../jobs/text.ts";

// Reads an exported WhatsApp group chat (_chat.txt) and keeps only the posts:
// a bold title, a link, and fields like Location, Eligible Countries and Deadline.
// Who sent each message (names, phone numbers) is never kept.

export type ChatPost = {
  kind: "job" | "scholarship";
  title: string;
  url: string;
  where: string;
  eligible: string;
  level: string;
  benefits: string[];
  deadline: string | null; // YYYY-MM-DD
  deadlineText: string;
  sharedAt: string | null; // when it was posted in the group
  needs: DocKind[]; // documents the post names
  text: string;
};

// "[10/20/26, 07:32:43] Name: text" (iPhone) or "20/10/2026, 07:32 - Name: text" (Android).
const HEAD = /^‎?\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?(?:\s?[AP]M)?\]?\s*(?:-\s*)?[^:\n]{1,80}:\s/gm;
const MONTHS = "january february march april may june july august september october november december".split(" ");
const NOISE = /^(fresh|new|latest|urgent)?\s*(job|scholarship)?\s*(alert|opportunity|opportunities)!*$/i;

const clean = (s: string) =>
  s
    .replace(/[‎‏‪-‮]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

function field(text: string, names: string[]): string {
  for (const n of names) {
    const m = text.match(new RegExp(`^\\s*\\*?\\s*\\*?${n}\\*?\\s*:\\*?\\s*(.+)$`, "im"));
    if (m)
      return clean(m[1])
        .replace(/[🇦-🇿]{2}/gu, "")
        .replace(/\s*\|\s*/g, ", ")
        .replace(/\s+,/g, ",")
        .trim();
  }
  return "";
}

// "December 4, 2026", "4 December 2026", "Nov 2, 2026" -> "2026-12-04"; "Varies", "Not Specified" -> null.
export function parseDeadline(raw: string): string | null {
  const t = raw.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1");
  const mi = MONTHS.findIndex((m) => new RegExp(`\\b${m.slice(0, 3)}[a-z]*\\b`).test(t));
  const year = t.match(/\b(20\d{2})\b/)?.[1];
  const day = t.replace(/\b20\d{2}\b/, "").match(/\b(\d{1,2})\b/)?.[1];
  if (mi < 0 || !year || !day) return null;
  return `${year}-${String(mi + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function kindOf(url: string, text: string): ChatPost["kind"] | null {
  if (/scholarshipregion\.com|scholarship/i.test(url)) return "scholarship";
  if (/jobsregion\.com|\/jobs?\b|careers?|greenhouse|lever\.co|workable|linkedin\.com\/jobs/i.test(url)) return "job";
  if (/\b(scholarship|fellowship|bursary|grant|fully funded|tuition)\b/i.test(text)) return "scholarship";
  if (/\b(job|hiring|vacanc|position|role|salary|internship|graduate trainee)\b/i.test(text)) return "job";
  return null;
}

export function parseChat(chat: string): ChatPost[] {
  const heads = [...chat.matchAll(HEAD)];
  const seen = new Set<string>();
  const out: ChatPost[] = [];
  heads.forEach((h, i) => {
    const body = chat.slice(h.index! + h[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined).split(/\n---\n|Join our WhatsApp channel/)[0];
    const links = [...body.matchAll(/https?:\/\/[^\s\]<>)]+/g)].map((m) => m[0].replace(/[.,]+$/, "")).filter((u) => !/whatsapp\.com|chat\.whatsapp|wa\.me/i.test(u));
    if (!links.length) return;
    const url = links[0];
    const key = url
      .replace(/[?#].*$/, "")
      .replace(/\/$/, "")
      .toLowerCase();
    if (seen.has(key)) return;
    const titles = [...body.matchAll(/^\s*\*([^*\n]{6,200})\*\s*$/gm)]
      .map((m) => clean(m[1]))
      .filter((t) => !NOISE.test(t) && !/^(benefits?|requirements?|click here|eligib|host|location|deadline|how to apply|shared by)/i.test(t));
    const title = titles[0] ?? clean(body.split("\n").find((l) => clean(l).length > 8 && !/https?:/.test(l)) ?? "");
    if (!title) return;
    const kind = kindOf(url, `${title} ${body}`);
    if (!kind) return;
    seen.add(key);
    const [, mo, d, y] = h.slice(0, 4);
    const yyyy = y.length === 2 ? `20${y}` : y;
    // iPhone exports are month/day; a first number over 12 means day/month.
    const [mm, dd] = Number(mo) > 12 ? [d, mo] : [mo, d];
    const deadlineText = field(body, ["Deadline", "Application Deadline", "Closing Date"]);
    const benefits = [...(body.match(/Benefits?:\*?\s*\n([\s\S]*?)(\n\s*\n|$)/i)?.[1] ?? "").matchAll(/^\s*[*•-]\s*(.+)$/gm)]
      .map((m) => clean(m[1]))
      .filter(Boolean)
      .slice(0, 6);
    out.push({
      kind,
      title: title.slice(0, 200),
      url,
      where: field(body, ["Host Countr(?:y|ies)", "Location", "Host", "Country"]).slice(0, 200),
      eligible: field(body, ["Eligible Countr(?:y|ies)", "Eligibility"]).slice(0, 200),
      level:
        field(body, ["Scholarship For", "Category", "Level", "Study Level"]).slice(0, 120) ||
        clean(body.match(/Scholarship For:\*?\s*\n((?:\s*[*•-].+\n?){1,4})/i)?.[1] ?? "")
          .replace(/^[*•-]\s*/, "")
          .replace(/\s*[*•-]\s*/g, ", "),
      benefits,
      deadline: parseDeadline(deadlineText),
      deadlineText: deadlineText.slice(0, 80),
      sharedAt: /^\d{4}$/.test(yyyy) ? `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` : null,
      needs: needsFromText(body),
      text: body
        .replace(/[‎‏‪-‮]/g, "")
        .trim()
        .slice(0, 4000),
    });
  });
  return out;
}

// Worth showing: still open (or no date given), and open to someone in Nigeria.
// A post with no deadline counts only if it was shared in the last 60 days.
export function stillOpen(p: ChatPost, today: string, country = "nigeria"): boolean {
  if (p.deadline && p.deadline < today) return false;
  if (!p.deadline && p.sharedAt && Date.parse(today) - Date.parse(p.sharedAt) > 60 * 86_400_000) return false;
  const e = p.eligible.toLowerCase();
  return !e || /all|any|international|africa|developing|commonwealth|worldwide|global/.test(e) || e.includes(country);
}

export const WHATSAPP_SOURCE = { whatsapp: { name: "Your WhatsApp groups", home: "/scholarships#import" } };

// "Customer Support Officer Job at LemFi (Formerly Lemonade) | Hybrid" -> role and company.
export function roleAndCompany(title: string): { role: string; company: string } {
  const t = title
    .replace(/^\d{4}\s+/, "")
    .replace(/\s*\|.*$/, "")
    .trim();
  const m = t.match(/^(.*?)\s+(?:Jobs?|Vacanc(?:y|ies)|Recruitment|Programme?|Internship|Positions?)?\s*at\s+(.+?)(?:\s*\(.*\))?(?:\s*[–-]\s*\d+ Positions?)?$/i);
  if (m) return { role: m[1].replace(/\s+(Job|Vacancy)$/i, "").trim() || t, company: m[2].trim() };
  return { role: t, company: "" };
}

// A job post from a chat, in the shape the job finder scores and saves.
export function chatToJob(p: ChatPost): JobPost {
  const { role, company } = roleAndCompany(p.title);
  const slug = p.url
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .slice(0, 120);
  const remote = /remote/i.test(p.where) || /\bremote\b/i.test(p.title);
  return {
    source: "whatsapp",
    externalId: `wa-${slug}`,
    title: role,
    company,
    companyLogo: null,
    url: p.url,
    applyUrl: p.url,
    description: [p.text, p.deadlineText ? `Deadline: ${p.deadlineText}` : ""].filter(Boolean).join("\n\n"),
    location: p.where || (remote ? "Remote" : ""),
    restrictions: p.where ? p.where.split(/\s*,\s*/).filter((x) => x && !/^(remote|hybrid|on-?site|global|worldwide)$/i.test(x)) : [],
    pay: parsePay(p.benefits.join(" ")),
    employmentType: /intern/i.test(p.title) ? "Internship" : "",
    postedAt: p.sharedAt ? `${p.sharedAt}T12:00:00.000Z` : null,
    tags: [],
  };
}
