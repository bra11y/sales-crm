// A daily post for X from the day's first study topic, with a real quote and a real reference.
// A quote is kept only when its words are on the author's Wikiquote page, and a reference only
// when Wikipedia has the article. Anything that cannot be checked is left out, never guessed.

import { ask, type Provider } from "../apply/ai.ts";
import type { Lesson, Topic } from "../study/topics.ts";

import type { DailyPost, Quote, Ref } from "./parts.ts";

export type { DailyPost, Quote, Ref };

export const X_LIMIT = 280;
const UA = { "user-agent": "SalesCRM/1.0 (daily study post)" };

export const POST_SYSTEM = [
  "You write one post for X for a person in Lagos who works in digital accessibility and tech.",
  "Teach one idea from the topic in plain words. Link it to tech, accessibility or building for everyone only when the link is real; otherwise use everyday life. Never force a metaphor. No boasting, no 'I did' claims, no selling.",
  "If an idea is unproven or debated (string theory, the multiverse, AGI), say so plainly.",
  "Be accurate. Never claim more than the science or scholarship shows, and never invent a study or a number. If a link to tech is a stretch, use everyday life instead.",
  "The main post is under 250 characters. Short sentences. No em dashes. No bold. No emojis. At most one hashtag, written in CamelCase. No all-caps words.",
  "Suggest one real, famous quote that fits, from a well-known thinker, writer or scientist, in its most common English wording, only if you are sure of the exact words and who said it. Keep it short. It will be checked against Wikiquote, so misattributed quotes are thrown away.",
  'Reply with JSON only: {"text":"the post","thread":["2 or 3 short replies that explain more, each under 260 characters"],"quote":{"text":"exact words","author":"Full Name as on Wikiquote"},"wikipedia":"the exact English Wikipedia article title for the topic"}',
].join("\n");

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[–—]\s*/g, ", ").replace(/\*\*/g, "").trim().slice(0, max) : "");

export type Draft = { text: string; thread: string[]; quote: { text: string; author: string } | null; wikipedia: string };

export function readDraft(raw: string): Draft | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as Record<string, unknown>;
    const text = clean(v.text, 400);
    if (!text || text.length > X_LIMIT) return null;
    const thread = (Array.isArray(v.thread) ? v.thread : []).map((t) => clean(t, 400)).filter((t) => t && t.length <= X_LIMIT).slice(0, 3);
    const q = (v.quote && typeof v.quote === "object" ? v.quote : {}) as Record<string, unknown>;
    const quote = clean(q.text, 300) && clean(q.author, 80) ? { text: clean(q.text, 300).replace(/^["“]|["”]$/g, ""), author: clean(q.author, 80) } : null;
    return { text, thread, quote, wikipedia: clean(v.wikipedia, 120) };
  } catch {
    return null;
  }
}

// Letters and digits only, so wiki markup and curly quotes do not stop a match.
export const plain = (s: string) =>
  s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "");

// Wikiquote pages list wrongly credited lines too, under "Misattributed" or "Disputed", and
// quotes by other people under "Quotes about". Those sections never count.
export function ownQuotes(wikitext: string): string {
  return wikitext
    .split(/^(?===[^=])/m)
    .filter((part) => !/^==\s*[^=\n]*(misattribut|disputed|quotes? about|about \w|sayings? about|see also|external links)/i.test(part))
    .join("\n");
}

async function rawPage(title: string, fetcher: typeof fetch, hops = 0): Promise<{ title: string; text: string } | null> {
  const res = await fetcher(`https://en.wikiquote.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const text = await res.text();
  const to = text.match(/^#REDIRECT\s*\[\[([^\]#|]+)/i)?.[1];
  if (to) return hops < 2 ? rawPage(to.trim().replace(/\s+/g, "_"), fetcher, hops + 1) : null;
  return { title, text };
}

export async function checkQuote(q: { text: string; author: string }, fetcher: typeof fetch = fetch): Promise<Quote | null> {
  try {
    const page = await rawPage(q.author.trim().replace(/\s+/g, "_"), fetcher);
    if (!page) return null;
    const words = plain(q.text);
    if (words.length < 12 || !plain(ownQuotes(page.text)).includes(words)) return null;
    return { text: q.text, author: page.title.replace(/_/g, " "), url: `https://en.wikiquote.org/wiki/${encodeURIComponent(page.title)}` };
  } catch {
    return null;
  }
}

export async function checkRef(title: string, fetcher: typeof fetch = fetch): Promise<Ref | null> {
  if (!title) return null;
  try {
    const res = await fetcher(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, "_"))}`, { headers: UA, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const v = (await res.json()) as { type?: string; title?: string; content_urls?: { desktop?: { page?: string } } };
    const url = v.content_urls?.desktop?.page;
    if (v.type === "disambiguation" || !url) return null;
    return { title: v.title ?? title, url };
  } catch {
    return null;
  }
}

// One more try when the first quote is not on Wikiquote, naming the one that failed.
async function secondQuote(p: Provider, t: Topic, failed: { text: string; author: string } | null, fetcher: typeof fetch): Promise<Quote | null> {
  const system = 'Give one short, real, famous quote that fits the topic, in the exact wording found on the author\'s English Wikiquote page. Reply with JSON only: {"text":"exact words","author":"Full Name as the Wikiquote page title"}';
  try {
    const raw = await ask(p, system, `Topic: ${t.name} (${t.category})${failed ? `\nNot this one, it could not be checked: "${failed.text}" (${failed.author})` : ""}`, fetcher, 200, 0.5);
    const m = raw.match(/\{[\s\S]*\}/);
    const v = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
    const q = { text: clean(v.text, 300).replace(/^["“]|["”]$/g, ""), author: clean(v.author, 80) };
    return q.text && q.author ? await checkQuote(q, fetcher) : null;
  } catch {
    return null;
  }
}

export async function writePost(t: Topic, lesson: Lesson | null, providers: Provider[], fetcher: typeof fetch = fetch): Promise<DailyPost | null> {
  const user = [`Topic: ${t.name} (${t.category})`, lesson ? `What it is: ${lesson.explain}\nExample: ${lesson.example}` : ""].filter(Boolean).join("\n");
  for (const p of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let draft: Draft | null = null;
      try {
        draft = readDraft(await ask(p, POST_SYSTEM, user, fetcher, 700, 0.6));
      } catch {
        break;
      }
      if (!draft) continue;
      const [first, ref, fallback] = await Promise.all([draft.quote ? checkQuote(draft.quote, fetcher) : null, checkRef(draft.wikipedia, fetcher), checkRef(t.name, fetcher)]);
      const quote = first ?? (await secondQuote(p, t, draft.quote, fetcher));
      const refs = [ref ?? fallback].filter((r): r is Ref => Boolean(r));
      return { topic: t.name, slug: t.slug, text: draft.text, thread: draft.thread, quote, refs, from: `${p.name} · ${p.model}` };
    }
  }
  return null;
}

type Db = {
  from: (t: string) => {
    select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null }> } };
    upsert: (row: Record<string, unknown>, o?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

// The morning job: today's post, written once after today's lessons.
export async function preparePost(db: Db, providers: Provider[], day: string, topic: Topic, fetcher: typeof fetch = fetch) {
  const { data: have } = await db.from("daily_posts").select("day").eq("day", day).maybeSingle();
  if (have) return { day, written: false };
  const { data } = await db.from("study_lessons").select("lesson").eq("slug", topic.slug).maybeSingle();
  const post = await writePost(topic, (data?.lesson as Lesson | undefined) ?? null, providers, fetcher);
  if (!post) return { day, written: false };
  const { error } = await db.from("daily_posts").upsert({ day, post }, { onConflict: "day" });
  return { day, written: !error };
}

export { postParts, xIntent } from "./parts.ts";
