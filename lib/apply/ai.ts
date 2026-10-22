// The one part of an application the rules can't write: why you want THIS job.
// A small model writes two sentences from the job post. Code then checks every
// name and number against the post and your Profile, and falls back to a plain
// rule-based sentence when the model is off, out of credit, or invents anything.
//
// Any OpenAI-style chat endpoint works: Vercel AI Gateway, Groq, Gemini, OpenRouter, xAI.

import E from "./engine.js";
import type { Facts } from "../jobs/facts.ts";

export type Provider = { name: string; baseUrl: string; apiKey: string; model: string };
export type Why = { why: string; manager: string; source: "ai" | "rules"; provider?: string; note?: string };
export type JobText = { title: string; company: string; description: string };
type Fetcher = typeof fetch;

export const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";
export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
const POST_LIMIT = 6000;

// The free provider (if set) goes first; the Gateway is the backup.
export function aiProviders(env: Record<string, string | undefined>, oidcToken?: string | null): Provider[] {
  const list: Provider[] = [];
  if (env.FREE_AI_BASE_URL && env.FREE_AI_API_KEY && env.FREE_AI_MODEL) {
    list.push({ name: "free", baseUrl: env.FREE_AI_BASE_URL.replace(/\/$/, ""), apiKey: env.FREE_AI_API_KEY, model: env.FREE_AI_MODEL });
  }
  const gatewayKey = env.AI_GATEWAY_API_KEY || oidcToken || env.VERCEL_OIDC_TOKEN;
  if (gatewayKey) list.push({ name: "gateway", baseUrl: GATEWAY_URL, apiKey: gatewayKey, model: env.AI_MODEL || DEFAULT_MODEL });
  return list;
}

export function buildPrompt(job: JobText, skills: string[], fix?: string): { system: string; user: string } {
  const system = [
    "You write one short paragraph for a cover letter: why the applicant wants this job at this company.",
    "Rules:",
    "- Two sentences, 25 to 55 words in total. Plain English, active voice.",
    "- Name one specific thing from the job post: the product, its users, the mission or a problem the post names.",
    "- Link it to one skill from the applicant's skill list.",
    "- Use only facts from the job post and the skill list. Never add numbers, years, tools, employers or results.",
    "- No em dashes. Never use: passionate, excited, thrilled, leverage, seamless, robust, cutting-edge, elevate, dynamic, journey.",
    "- Also give the name of the person to address, only if the post names one (like 'Send it to Jane Doe'). Otherwise an empty string.",
    'Reply with JSON only: {"why": "...", "manager": "..."}',
  ].join("\n");
  const user = [
    `Company: ${job.company || "not named"}`,
    `Role: ${job.title}`,
    `Applicant skills: ${skills.join(", ") || "accessibility, front-end development"}`,
    fix ? `Your last answer failed this check, fix it: ${fix}` : "",
    "Job post:",
    job.description.slice(0, POST_LIMIT),
  ].filter(Boolean).join("\n");
  return { system, user };
}

export function parseAnswer(text: string): { why: string; manager: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as { why?: unknown; manager?: unknown };
    const why = typeof v.why === "string" ? v.why.replace(/\s+/g, " ").trim() : "";
    const manager = typeof v.manager === "string" ? v.manager.replace(/[^\p{L} .'-]/gu, "").trim().slice(0, 80) : "";
    return why ? { why, manager } : null;
  } catch {
    return null;
  }
}

const lower = (s: string) => s.toLowerCase();
const has = (hay: string, word: string) => new RegExp(`(^|[^a-z0-9])${word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(hay);

// Returns what is wrong, or "" when the paragraph is safe to send.
export function checkWhy(why: string, job: JobText, facts: Facts): string {
  const words = why.split(/\s+/).length;
  if (words < 12 || words > 80) return `It must be 25 to 55 words; it was ${words}.`;
  const known = lower([job.title, job.company, job.description, JSON.stringify(facts.skills), JSON.stringify(facts.person), JSON.stringify(facts.tracks)].join(" "));
  const numbers = why.match(/\d[\d.,%]*/g) ?? [];
  const badNumber = numbers.find((n) => !known.includes(n.replace(/[.,]$/, "")));
  if (badNumber) return `It names the number ${badNumber}, which is not in the job post or Profile.`;
  // Capitalised words that don't start a sentence are names: they must come from the post or Profile.
  const names = [...why.matchAll(/(?<![.!?]\s|^)\b([A-Z][A-Za-z0-9+#.]*[A-Za-z0-9+#])/g)].map((m) => m[1]).filter((w) => w !== "I");
  const badName = names.find((n) => !has(known, n));
  if (badName) return `It names "${badName}", which is not in the job post or Profile.`;
  const gap = facts.gaps.find((g) => has(lower(why), g));
  if (gap) return `It names ${gap}, a tool the applicant has not used.`;
  const lint = (E.lint(why) as string[]).filter((w) => !/sentences start|lists of three|Over half/.test(w));
  if (lint.length) return lint.join(" ");
  return "";
}

const list = (a: string[]) => (a.length <= 1 ? a[0] ?? "" : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

export function rulesWhy(job: JobText, skills: string[]): string {
  const company = job.company || "your team";
  const focus = skills.slice(0, 2);
  return focus.length
    ? `I want to bring my ${list(focus)} work to ${company}. Your post asks for the work I do every day, and I would like to do it for your users.`
    : `I want to help ${company} build a product that works for everyone who uses it. This role asks for the work I do every day.`;
}

async function ask(p: Provider, system: string, user: string, fetcher: Fetcher): Promise<string> {
  const res = await fetcher(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({ model: p.model, temperature: 0.3, max_tokens: 300, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`${p.name} answered ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function writeWhy(job: JobText, facts: Facts, skills: string[], providers: Provider[], fetcher: Fetcher = fetch): Promise<Why> {
  const fallback = (note: string): Why => ({ why: rulesWhy(job, skills), manager: "", source: "rules", note });
  if (!providers.length) return fallback("AI is off, so the plain sentence was used.");
  let fix = "";
  const errors: string[] = [];
  for (const p of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { system, user } = buildPrompt(job, skills, fix);
        const answer = parseAnswer(await ask(p, system, user, fetcher));
        if (!answer) {
          fix = "Reply with the JSON object only.";
          continue;
        }
        fix = checkWhy(answer.why, job, facts);
        const manager = answer.manager && has(lower(job.description), answer.manager) ? answer.manager : "";
        if (!fix) return { why: answer.why, manager, source: "ai", provider: `${p.name} · ${p.model}` };
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        break;
      }
    }
  }
  return fallback(fix ? `The AI draft failed a check (${fix}), so the plain sentence was used.` : `The AI was not reachable (${errors.join("; ") || "no answer"}), so the plain sentence was used.`);
}
