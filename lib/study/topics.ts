// Topics to study, from the topic cards saved on 26 November 2026, plus Ogilvy's 1982 rules on
// writing (in our own words). Three a day, taken in turn across the categories, so every topic
// comes round once in about four weeks.

import { ask, type Provider } from "../apply/ai.ts";

export type Category = { id: string; name: string; topics: string[] };

export const CATEGORIES: Category[] = [
  { id: "psychology", name: "Psychology", topics: ["Projection", "Scarcity mindset", "Imposter syndrome", "Learned helplessness", "Cognitive dissonance", "Confirmation bias", "Attachment theory", "Locus of control", "Self-serving bias", "Halo effect"] },
  { id: "neuroscience", name: "Neuroscience", topics: ["Neuroplasticity", "Dopamine reward pathways", "Mirror neurons", "The amygdala hijack", "Default mode network", "Synaptic pruning", "Brain lateralisation", "Neurogenesis", "Fight-or-flight response", "Cortisol regulation"] },
  { id: "finance", name: "Finance", topics: ["Inflation targeting", "Quantitative easing", "Asset bubbles", "Opportunity cost", "Network effects", "Economies of scale", "Market cycles", "Behavioural finance", "Risk premium", "Compound interest"] },
  { id: "technology", name: "Technology", topics: ["Technological singularity", "Algorithmic bias", "Surveillance capitalism", "Moore's law", "Network effects in platforms", "Artificial general intelligence", "Blockchain decentralisation", "Quantum computing", "The attention economy", "Automation displacement"] },
  { id: "science", name: "Science", topics: ["Chaos theory", "The Fermi paradox", "Entropy", "The double-slit experiment", "String theory", "Dark matter", "The multiverse hypothesis", "Schrödinger's cat", "Plate tectonics", "Evolutionary adaptation"] },
  { id: "philosophy", name: "Philosophy", topics: ["Existentialism", "Stoicism", "Nihilism", "Utilitarianism", "The social contract", "Determinism vs free will", "Moral relativism", "Absurdism", "Dualism vs materialism", "The trolley problem"] },
  { id: "culture", name: "Culture", topics: ["Cultural capital", "Soft power", "Orientalism", "Collective vs individualist societies", "Social stratification", "How beauty standards change", "Subcultures", "Cultural relativism", "Globalisation", "Prestige signalling"] },
  {
    id: "writing",
    name: "Writing (Ogilvy's rules)",
    topics: ["Learn to write from a good book on writing", "Write the way you talk", "Short words, sentences and paragraphs", "Cut the jargon", "Keep it under two pages", "Check your quotes", "Sleep on it, read it aloud, then edit", "Ask a colleague to improve it", "Say exactly what you want the reader to do", "When you want action, go and ask in person"],
  },
];

export type Topic = { slug: string; name: string; category: string; categoryId: string };

export const slugOf = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Round robin: Psychology 1, Neuroscience 1, Finance 1, ... then each category's second topic.
export const ALL_TOPICS: Topic[] = Array.from({ length: 10 }, (_, i) => CATEGORIES.map((c) => ({ slug: `${c.id}-${slugOf(c.topics[i])}`, name: c.topics[i], category: c.name, categoryId: c.id }))).flat();

export const PER_DAY = 3;

// Days since 1 Jan 2026 in Lagos time pick the three topics.
export function topicsFor(day: string): Topic[] {
  const n = Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse("2026-01-01T00:00:00Z")) / 86_400_000);
  return Array.from({ length: PER_DAY }, (_, i) => ALL_TOPICS[(((n * PER_DAY + i) % ALL_TOPICS.length) + ALL_TOPICS.length) % ALL_TOPICS.length]);
}

export const findTopic = (slug: string) => ALL_TOPICS.find((t) => t.slug === slug) ?? null;

export type Lesson = { explain: string; example: string; use: string; question: string; flow: string[]; from: string };

export const LESSON_SYSTEM = [
  "You teach one idea in five minutes to a curious adult in Lagos who works in tech and is job hunting.",
  "Be accurate. If scientists or scholars disagree, say so in one line. Never invent a study, a statistic or a quote.",
  "Plain English, short sentences, no jargon left unexplained. No em dashes. No bold.",
  'Reply with JSON only: {"explain":"what it is, 3 to 4 sentences","example":"one everyday example, 2 sentences, Nigerian setting where it fits","use":"how to use it this week at work, in a job search or in writing, 2 sentences","question":"one question to think about","flow":["4 to 6 short steps, under 8 words each, showing how the idea works from cause to effect"]}',
].join("\n");

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s[–—]\s/g, ", ").replace(/\*\*/g, "").trim().slice(0, max) : "");

export function readLesson(text: string, from: string): Lesson | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as Record<string, unknown>;
    const flow = Array.isArray(v.flow) ? v.flow.map((x) => str(x, 80)).filter(Boolean).slice(0, 6) : [];
    const lesson = { explain: str(v.explain, 900), example: str(v.example, 500), use: str(v.use, 500), question: str(v.question, 300), flow, from };
    return lesson.explain && lesson.example && lesson.use && flow.length >= 3 ? lesson : null;
  } catch {
    return null;
  }
}

export async function writeLesson(t: Topic, providers: Provider[], fetcher: typeof fetch = fetch): Promise<Lesson | null> {
  for (const p of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const l = readLesson(await ask(p, LESSON_SYSTEM, `Topic: ${t.name} (${t.category})`, fetcher, 900, 0.4), `${p.name} · ${p.model}`);
        if (l) return l;
      } catch {
        break;
      }
    }
  }
  return null;
}

type Db = {
  from: (t: string) => {
    select: (c: string) => { in: (col: string, v: string[]) => PromiseLike<{ data: { slug: string }[] | null }> };
    upsert: (row: Record<string, unknown>, o?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

// The morning job: today's three lessons, written once and kept for everyone.
export async function prepareStudy(db: Db, providers: Provider[], day: string, fetcher: typeof fetch = fetch) {
  const today = topicsFor(day);
  const { data } = await db.from("study_lessons").select("slug").in("slug", today.map((t) => t.slug));
  const have = new Set((data ?? []).map((r) => r.slug));
  let written = 0;
  for (const t of today.filter((x) => !have.has(x.slug))) {
    const lesson = await writeLesson(t, providers, fetcher);
    if (!lesson) continue;
    const { error } = await db.from("study_lessons").upsert({ slug: t.slug, lesson }, { onConflict: "slug" });
    if (!error) written++;
  }
  return { day, topics: today.map((t) => t.slug), written };
}
