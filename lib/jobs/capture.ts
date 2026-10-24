// Turns a job you saw somewhere else (a phone screenshot, a pasted post or link)
// into a job on your board. A small vision model reads the screenshot once; code
// checks that the title and company it gives are really in the text it read.

import type { Provider } from "../apply/ai.ts";
import type { JobPost } from "./sources.ts";
import { parsePay } from "./text.ts";

export type Captured = { title: string; company: string; location: string; pay: string; employmentType: string; link: string; email: string; posted: string; description: string; seen: string };
export type CaptureInput = { image?: string; text?: string; link?: string };
type Fetcher = typeof fetch;

const SYSTEM = [
  "You read one job post from a screenshot or pasted text and copy its details out.",
  "Rules:",
  "- Copy words exactly as they appear. Never guess or add anything that is not shown.",
  "- seen: every word you can read, in reading order, up to 600 words.",
  "- description: the post's own text about the role, duties and requirements, up to 400 words.",
  "- link: a web address shown for the job, or an empty string. email: an application email shown, or an empty string.",
  "- posted: when it was posted as shown (like '3 days ago' or '12 Oct 2026'), or an empty string.",
  "- If it is not a job post, give an empty title.",
  'Reply with JSON only: {"title":"","company":"","location":"","pay":"","employmentType":"","link":"","email":"","posted":"","description":"","seen":""}',
].join("\n");

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseCapture(answer: string): Captured | null {
  const m = answer.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as Record<string, unknown>;
    const c: Captured = {
      title: str(v.title, 200),
      company: str(v.company, 120),
      location: str(v.location, 200),
      pay: str(v.pay, 120),
      employmentType: str(v.employmentType, 80),
      link: str(v.link, 600),
      email: str(v.email, 200),
      posted: str(v.posted, 60),
      description: typeof v.description === "string" ? v.description.trim().slice(0, 6000) : "",
      seen: str(v.seen, 8000),
    };
    return c.title ? c : null;
  } catch {
    return null;
  }
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Returns what is wrong, or "" when the title and company really appear in what was read.
export function checkCapture(c: Captured, pasted = ""): string {
  const hay = ` ${plain(`${c.seen} ${c.description} ${pasted}`)} `;
  const missing = (s: string) => {
    const words = plain(s)
      .split(" ")
      .filter((w) => w.length > 2);
    return words.length > 0 && words.filter((w) => hay.includes(` ${w} `)).length < Math.ceil(words.length * 0.6);
  };
  if (missing(c.title)) return `The title "${c.title}" is not in the text that was read.`;
  if (c.company && missing(c.company)) return `The company "${c.company}" is not in the text that was read.`;
  return "";
}

// "3 days ago", "2w", "12 Oct 2026" -> a date; anything else -> null.
export function postedDate(text: string, now = new Date()): string | null {
  const t = text.toLowerCase();
  if (/\b(today|just now|hours? ago|\d+\s*h\b|minutes? ago)/.test(t)) return now.toISOString();
  if (/\byesterday\b/.test(t)) return new Date(now.getTime() - 86_400_000).toISOString();
  const rel = t.match(/(\d+)\s*(d|day|days|w|wk|week|weeks|mo|month|months)\b/);
  if (rel) {
    const n = Number(rel[1]);
    const days = rel[2].startsWith("w") ? 7 : rel[2].startsWith("m") ? 30 : 1;
    return new Date(now.getTime() - n * days * 86_400_000).toISOString();
  }
  const abs = Date.parse(text);
  return Number.isFinite(abs) && abs <= now.getTime() ? new Date(abs).toISOString() : null;
}

export function httpsLink(raw: string): string | null {
  const s = raw.trim().replace(/[).,]+$/, "");
  if (!s) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol === "http:") u.protocol = "https:";
    return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

const slug = (s: string) => plain(s).replace(/ /g, "-").slice(0, 120);

export function toPost(c: Captured, input: CaptureInput, now = new Date()): JobPost {
  const link = httpsLink(input.link ?? "") ?? httpsLink(c.link);
  const where = c.location;
  // No link in the screenshot: the job opens a web search for it instead.
  const search = `https://www.google.com/search?q=${encodeURIComponent(`${c.title} ${c.company} job`)}`;
  const body = c.description || c.seen;
  return {
    source: "capture",
    externalId: link ? `link-${slug(link)}` : `shot-${slug(`${c.title} ${c.company}`)}`,
    title: c.title,
    company: c.company,
    companyLogo: null,
    url: link ?? search,
    applyUrl: link ?? search,
    description: [body, c.email ? `Apply by email: ${c.email}` : ""].filter(Boolean).join("\n\n"),
    location: where,
    restrictions: where
      ? where
          .split(/\s*[,;/|]\s*/)
          .map((p) =>
            p
              .replace(/^(?:fully\s+)?remote\s*\(([^)]+)\)$/i, "$1")
              .replace(/\((remote|hybrid|on-?site)\)/i, "")
              .trim(),
          )
          .filter((p) => p && !/^(remote|hybrid|on-?site)$/i.test(p))
      : [],
    pay: parsePay(c.pay),
    employmentType: c.employmentType,
    postedAt: postedDate(c.posted, now),
    tags: [],
  };
}

async function ask(p: Provider, input: CaptureInput, fix: string, fetcher: Fetcher): Promise<string> {
  const note = [
    input.link ? `Link given with it: ${input.link}` : "",
    input.text ? `Text given with it:\n${input.text.slice(0, 8000)}` : "",
    fix ? `Your last answer failed this check, fix it: ${fix}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const content = input.image
    ? [
        { type: "text", text: note || "Read this job post." },
        { type: "image_url", image_url: { url: input.image } },
      ]
    : note;
  const res = await fetcher(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({
      model: p.model,
      temperature: 0,
      max_tokens: 2500,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${p.name} answered ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export type CaptureResult = { ok: true; post: JobPost; read: Captured; provider: string } | { ok: false; error: string };

export async function readCapture(input: CaptureInput, providers: Provider[], fetcher: Fetcher = fetch, now = new Date()): Promise<CaptureResult> {
  if (!input.image && !input.text?.trim()) return { ok: false, error: "Add a screenshot, or paste the job post's text." };
  if (!providers.length) return { ok: false, error: "Reading screenshots needs the AI, and it is not set up. Paste the job's link into the Jobs search instead." };
  let fix = "";
  const errors: string[] = [];
  for (const p of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const read = parseCapture(await ask(p, input, fix, fetcher));
        if (!read) return { ok: false, error: "That does not look like a job post. Try a screenshot that shows the job title and company." };
        fix = checkCapture(read, input.text);
        if (!fix) return { ok: true, post: toPost(read, input, now), read, provider: `${p.name} · ${p.model}` };
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        break;
      }
    }
  }
  return {
    ok: false,
    error: fix ? "The screenshot could not be read clearly. Try a sharper one, or paste the post's text." : `The AI could not be reached (${errors.join("; ")}). Try again in a minute.`,
  };
}

export const CAPTURE_SOURCE = { capture: { name: "Your screenshot", home: "/jobs/add" } };
