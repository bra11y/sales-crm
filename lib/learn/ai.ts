// Turns a transcript or a book's text into a note you will use: a summary, key points, study
// questions, post drafts, content ideas and project ideas. Long text is read in parts, then the
// parts are joined, so a free-tier key copes with an hour-long video or a whole book.

import { aiProviders, type Provider } from "../apply/ai.ts";

export type NotePost = { platform: "LinkedIn" | "X" | "Instagram"; text: string };
export type NoteAi = {
  summary: string;
  points: string[];
  questions: string[];
  posts: NotePost[];
  ideas: string[];
  projects: string[];
  provider: string;
  at: string;
};
export type Source = { kind: "video" | "text" | "book"; title: string; by: string };
type Fetcher = typeof fetch;

export const PART_CHARS = 12_000;
export const MAX_PARTS = 12;
export const NVIDIA_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_MODEL = "mistralai/mistral-large-4-1t-a52b";

// Groq (free) first, then NVIDIA (free), then the Vercel AI Gateway.
export function learnProviders(env: Record<string, string | undefined>, oidcToken?: string | null): Provider[] {
  const list = aiProviders(env, oidcToken);
  // Groq limits each model on its own, so its small model doubles what a free key can do.
  const groq = list.find((p) => p.name === "free" && /groq\.com/.test(p.baseUrl));
  const small = env.FREE_AI_SMALL_MODEL ?? "openai/gpt-oss-20b";
  if (groq && small && small !== groq.model) list.splice(list.indexOf(groq) + 1, 0, { ...groq, name: "free-small", model: small });
  if (env.NVIDIA_API_KEY) {
    const nvidia = { name: "nvidia", baseUrl: NVIDIA_URL, apiKey: env.NVIDIA_API_KEY, model: env.NVIDIA_MODEL || NVIDIA_MODEL };
    const at = list.findIndex((p) => p.name === "gateway");
    list.splice(at < 0 ? list.length : at, 0, nvidia);
  }
  return list;
}

// Split on paragraph or sentence ends near the size limit. When there are more parts than the
// limit, keep parts spread evenly through the text, so the end of a book is read too.
export function splitText(text: string, size = PART_CHARS, max = MAX_PARTS): { parts: string[]; skipped: number } {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  const parts: string[] = [];
  let at = 0;
  while (at < clean.length) {
    let end = Math.min(clean.length, at + size);
    if (end < clean.length) {
      const window = clean.slice(at + Math.floor(size * 0.7), end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (cut > 0) end = at + Math.floor(size * 0.7) + cut + 1;
    }
    parts.push(clean.slice(at, end).trim());
    at = end;
  }
  if (parts.length <= max) return { parts: parts.filter(Boolean), skipped: 0 };
  const pick = Array.from({ length: max }, (_, i) => parts[Math.round((i * (parts.length - 1)) / (max - 1))]);
  return { parts: pick, skipped: parts.length - max };
}

const STYLE = [
  "Plain English at a grade 6 to 9 reading level. Active voice. One idea per sentence.",
  "No em dashes. Never use: passionate, excited, thrilled, leverage, seamless, robust, cutting-edge, elevate, dynamic, journey, game-changer, delve.",
  "No words in all capitals. Hashtags in CamelCase, like #WebAccessibility, at most three per post.",
  "No ableist idioms (like 'fell on deaf ears' or 'turn a blind eye'). Person-first language about disability.",
  "Use only what the source says. Never add numbers, names, quotes or claims that are not in it.",
].join("\n");

export function notePrompt(source: Source, text: string, partial: boolean): { system: string; user: string } {
  const system = [
    `You turn ${source.kind === "video" ? "a video transcript" : source.kind === "book" ? "notes from a book" : "a piece of writing"} into a note a learner will use.`,
    STYLE,
    "Reply with JSON only, in this shape:",
    "posts must hold exactly three items: one for LinkedIn, one for X and one for Instagram.",
    '{"summary":"3 to 5 sentences","points":["5 to 8 key points, one sentence each"],"questions":["4 study questions that check understanding"],',
    '"posts":[{"platform":"LinkedIn","text":"80 to 150 words, a lesson in the writer\'s own voice"},{"platform":"X","text":"under 270 characters"},{"platform":"Instagram","text":"a caption of 40 to 80 words"}],',
    '"ideas":["4 content ideas: a post, a short video or a thread, each one line"],"projects":["3 small projects that practise what was learned, each one line"]}',
  ].join("\n");
  const user = [
    `Title: ${source.title}`,
    source.by ? `By: ${source.by}` : "",
    partial ? "These are notes made from each part of a long source, in order:" : "Source:",
    text,
  ]
    .filter(Boolean)
    .join("\n");
  return { system, user };
}

export function partPrompt(source: Source, part: string, n: number, of: number): { system: string; user: string } {
  return {
    system: ["You take notes on one part of a longer source.", STYLE, 'Reply with JSON only: {"points":["4 to 8 key points from this part, one sentence each"]}'].join("\n"),
    user: `Title: ${source.title}\nPart ${n} of ${of}:\n${part}`,
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*—\s*/g, ", ").trim().slice(0, max) : "");
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const PLATFORMS = ["LinkedIn", "X", "Instagram"] as const;

export function readJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseNote(text: string): Omit<NoteAi, "provider" | "at"> | null {
  const v = readJson(text);
  if (!v) return null;
  const summary = str(v.summary, 1200);
  const points = strs(v.points, 10, 300);
  if (!summary || points.length < 2) return null;
  const posts = (Array.isArray(v.posts) ? v.posts : [])
    .map((p) => {
      const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      const platform = PLATFORMS.find((x) => x.toLowerCase() === String(o.platform ?? "").toLowerCase().replace("twitter", "x"));
      const max = platform === "X" ? 280 : 1500;
      return platform ? { platform, text: str(o.text, max) } : null;
    })
    .filter((p): p is NotePost => Boolean(p?.text))
    .slice(0, 3);
  return { summary, points, questions: strs(v.questions, 6, 300), posts, ideas: strs(v.ideas, 6, 300), projects: strs(v.projects, 5, 300) };
}

export async function chat(p: Provider, system: string, user: string, fetcher: Fetcher = fetch, maxTokens = 2000): Promise<string> {
  const res = await fetcher(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({
      model: p.model,
      temperature: 0.3,
      // NVIDIA's model thinks before it answers, and the thinking counts against this limit.
      max_tokens: p.name === "nvidia" ? maxTokens * 4 : maxTokens,
      ...(/gpt-oss/.test(p.model) ? { reasoning_effort: "low" } : {}),
      ...(/groq\.com/.test(p.baseUrl) ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(p.name === "nvidia" ? 120_000 : 60_000),
  });
  if (res.status === 429) throw new RateLimited(p.name, Number(res.headers.get("retry-after")) || 10);
  if (!res.ok) throw new Error(`${p.name} answered ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export class RateLimited extends Error {
  waitSeconds: number;
  constructor(name: string, waitSeconds: number) {
    super(`${name} is busy (too many requests)`);
    this.waitSeconds = waitSeconds;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const MAX_WAIT_SECONDS = 20;

// Each provider in turn, until one gives an answer that passes `read`.
async function firstGood<T>(providers: Provider[], system: string, user: string, read: (t: string) => T | null, fetcher: Fetcher, maxTokens: number): Promise<{ value: T; provider: Provider } | { error: string }> {
  const errors: string[] = [];
  for (const p of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const value = read(await chat(p, system, user, fetcher, maxTokens));
        if (value) return { value, provider: p };
        errors.push(`${p.name} gave an answer that could not be read`);
      } catch (e) {
        if (e instanceof RateLimited && attempt === 0 && e.waitSeconds <= MAX_WAIT_SECONDS) {
          await sleep(e.waitSeconds * 1000);
          continue;
        }
        errors.push(e instanceof Error ? e.message : String(e));
        break;
      }
    }
  }
  return { error: errors.join("; ") || "No AI is set up" };
}

export type MakeResult = { ok: true; ai: NoteAi; parts: number; skipped: number } | { ok: false; error: string };

// Step 1 for long text: key points from one part.
export async function partNotes(source: Source, part: string, n: number, of: number, providers: Provider[], fetcher: Fetcher = fetch): Promise<{ ok: true; points: string[] } | { ok: false; error: string }> {
  const { system, user } = partPrompt(source, part, n, of);
  const r = await firstGood(providers, system, user, (t) => {
    const pts = strs(readJson(t)?.points, 8, 300);
    return pts.length ? pts : null;
  }, fetcher, 900);
  return "error" in r ? { ok: false, error: `Part ${n} of ${of} could not be read: ${r.error}` } : { ok: true, points: r.value };
}

// Step 2: the note, from the whole text (short) or from every part's points (long).
export async function finalNote(source: Source, body: string, partial: boolean, providers: Provider[], fetcher: Fetcher = fetch, now = new Date()): Promise<{ ok: true; ai: NoteAi } | { ok: false; error: string }> {
  const { system, user } = notePrompt(source, body, partial);
  const r = await firstGood(providers, system, user, parseNote, fetcher, 2500);
  if ("error" in r) return { ok: false, error: `The summary could not be written: ${r.error}` };
  return { ok: true, ai: { ...r.value, provider: `${r.provider.name} · ${r.provider.model}`, at: now.toISOString() } };
}

export const joinParts = (points: string[][]) => points.map((p, i) => `Part ${i + 1}:\n- ${p.join("\n- ")}`).join("\n\n");

export async function makeNote(source: Source, text: string, providers: Provider[], fetcher: Fetcher = fetch, now = new Date()): Promise<MakeResult> {
  if (!providers.length) return { ok: false, error: "AI is off, so only your own words are saved. Turn AI on in your Profile to get a summary and post drafts." };
  if (text.trim().length < 200) return { ok: false, error: "There is too little text to summarise. Paste the full transcript or add more of your own notes." };
  const { parts, skipped } = splitText(text);
  let body = parts[0];
  if (parts.length > 1) {
    const all: string[][] = [];
    for (const [i, part] of parts.entries()) {
      const r = await partNotes(source, part, i + 1, parts.length, providers, fetcher);
      if (!r.ok) return r;
      all.push(r.points);
    }
    body = joinParts(all);
  }
  const r = await finalNote(source, body, parts.length > 1, providers, fetcher, now);
  return r.ok ? { ...r, parts: parts.length, skipped } : r;
}

// Key ideas for a catalogue book the app has not read: from the model's general knowledge,
// and always shown with that warning.
export function bookIdeasPrompt(title: string, author: string, field: string): { system: string; user: string } {
  return {
    system: [
      "You explain the main ideas of a well-known book for a learner.",
      STYLE.replace("Use only what the source says. Never add numbers, names, quotes or claims that are not in it.", "Never quote the book. If you do not know this book well, say so in the summary and keep the points general."),
      'Reply with JSON only: {"summary":"3 to 5 sentences","points":["5 to 8 main ideas"],"questions":["4 questions to think about while reading"],"posts":[],"ideas":["3 content ideas"],"projects":["3 small projects that practise the ideas"]}',
    ].join("\n"),
    user: `Book: ${title}\nAuthor: ${author || "unknown"}\nThe reader works in: ${field}`,
  };
}

export async function bookIdeas(title: string, author: string, field: string, providers: Provider[], fetcher: Fetcher = fetch, now = new Date()): Promise<MakeResult> {
  if (!providers.length) return { ok: false, error: "AI is off. Turn it on in your Profile to get key ideas." };
  const { system, user } = bookIdeasPrompt(title, author, field);
  const r = await firstGood(providers, system, user, parseNote, fetcher, 2000);
  if ("error" in r) return { ok: false, error: `The key ideas could not be written: ${r.error}` };
  return { ok: true, ai: { ...r.value, provider: `${r.provider.name} · ${r.provider.model}`, at: now.toISOString() }, parts: 0, skipped: 0 };
}
