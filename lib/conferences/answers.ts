// Drafts your answers to a conference form from your Profile, in your voice. Code checks each
// one: inside the word limit, no name or number you never gave, none of the AI tells. An
// answer that fails three times is left empty with the reason, so you write that one yourself.

import E from "../apply/engine.js";
import { ask, type Provider } from "../apply/ai.ts";
import { plain } from "../apply/humanize.ts";
import type { Facts } from "../jobs/facts.ts";
import type { Conference, Question } from "./conferences.ts";

type Fetcher = typeof fetch;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function profileBrief(f: Facts): string {
  const track = Object.values(f.tracks)[0];
  return [
    `Name: ${f.person.name ?? ""}. Lives in: ${f.person.location ?? ""}.`,
    track ? `About: ${track.profile}` : "",
    track?.story ? `A story they tell: ${track.story}` : "",
    `Jobs: ${f.jobs.map((j) => `${Object.values(j.title)[0] ?? ""} at ${j.org} (${j.dates}): ${j.bullets.slice(0, 3).map((b) => b.text).join(" ")}`).join(" | ")}`,
    `Projects: ${f.projects.map((p) => p.text).join(" | ")}`,
    `Work with results: ${f.work.map((w) => `${w.title}: ${w.what} ${w.result}`).join(" | ")}`,
    `Certifications: ${f.certifications.join(", ")}. Education: ${f.education.degree}, ${f.education.school}.`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);
}

export function buildAnswerPrompt(q: Question, c: Pick<Conference, "name" | "place" | "summary" | "covers">, brief: string, voice: string, fix?: string) {
  const limit = q.limit ?? 200;
  const system = [
    "You write one answer on a conference application form, as the applicant, in the first person.",
    `Stay under ${limit} words; aim for about ${Math.round(limit * 0.8)}.`,
    "Use only facts from the applicant's profile and the conference details. Never add a number, place, employer, award or result.",
    "Lead with one real example from the profile: what they did, for whom, and what changed. Then answer the question directly.",
    "Name the conference or city once, where it fits. Say what the applicant will do after, in concrete steps from their real work.",
    "Plain English, active voice, short and long sentences mixed. No em dashes. No 'not X but Y'. No run-up like 'Here's the thing'.",
    "Never use: passionate, excited, eager, thrilled, honoured, leverage, journey, tapestry, testament, crucial, pivotal, foster, empower, truly, deeply.",
    voice.trim() ? `Write the way the applicant writes. Their own writing:\n${voice.trim().slice(0, 1500)}` : "",
    'Reply with JSON only: {"answer": "..."}',
  ]
    .filter(Boolean)
    .join("\n");
  const user = [fix ? `Your last answer failed this check, fix it: ${fix}` : "", `Conference: ${c.name}${c.place ? `, ${c.place}` : ""}`, c.summary ? `About it: ${c.summary}` : "", `Question: ${q.q}`, "Applicant profile:", brief]
    .filter(Boolean)
    .join("\n");
  return { system, user };
}

export function checkAnswer(answer: string, q: Question, known: string): string {
  const n = words(answer);
  const limit = q.limit ?? 200;
  if (n > limit) return `It must be under ${limit} words; it was ${n}.`;
  if (n < Math.min(40, limit / 2)) return `It is only ${n} words. Add the example from the profile.`;
  const low = known.toLowerCase();
  const badNumber = (answer.match(/\d[\d.,%]*/g) ?? []).map((x) => x.replace(/[.,]$/, "")).find((x) => !low.includes(x));
  if (badNumber) return `It names the number ${badNumber}, which is not in the profile.`;
  const names = [...answer.matchAll(/(?<![.!?:"]\s|^|\n)\b([A-Z][A-Za-z0-9+#.]*[A-Za-z0-9+#])/g)].map((m) => m[1]).filter((w) => w !== "I");
  const badName = names.find((x) => !new RegExp(`(^|[^a-z0-9])${esc(x.toLowerCase())}(?![a-z0-9])`).test(low));
  if (badName) return `It names "${badName}", which is not in the profile or the conference details.`;
  const lint = (E.lint(answer) as string[]).filter((w) => !/Over half|lists of three|sentences start|same length|over 32 words/.test(w));
  return lint.join(" ");
}

export function parseAnswerJson(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as { answer?: unknown };
    return typeof v.answer === "string" && v.answer.trim() ? plain(v.answer.replace(/\s*\n\s*\n\s*/g, "\n\n")) : null;
  } catch {
    return null;
  }
}

export async function draftAnswers(c: Conference, facts: Facts, voice: string, providers: Provider[], fetcher: Fetcher = fetch): Promise<{ questions: Question[]; written: number; note: string }> {
  if (!providers.length) return { questions: c.questions, written: 0, note: "AI is off in Settings, so no answers were drafted." };
  const brief = profileBrief(facts);
  const known = [brief, c.name, c.place ?? "", c.summary ?? "", c.covers ?? "", JSON.stringify(facts.person), JSON.stringify(facts.skills)].join(" ");
  let written = 0;
  const out: Question[] = [];
  for (const q of c.questions) {
    if (q.answer && q.source === "you") {
      out.push(q);
      continue;
    }
    let fix = "";
    let done: Question | null = null;
    for (const p of providers) {
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        try {
          const { system, user } = buildAnswerPrompt(q, c, brief, voice, fix);
          const a = parseAnswerJson(await ask(p, system, user, fetcher, 700, 0.6));
          if (!a) {
            fix = "Reply with the JSON object only.";
            continue;
          }
          fix = checkAnswer(a, q, known);
          if (!fix) done = { ...q, answer: a, source: "ai", note: `${p.name} · ${p.model}` };
        } catch {
          break;
        }
      }
      if (done) break;
    }
    if (done) written++;
    out.push(done ?? { ...q, note: fix ? `The draft failed a check (${fix}). Write this one yourself.` : "The AI did not answer. Try again later." });
  }
  return { questions: out, written, note: `${written} of ${c.questions.length} answers drafted and checked.` };
}
