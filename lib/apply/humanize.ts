// The rule-built letter is accurate but has the same shape every time. This pass asks a model
// to rewrite it in your own voice, with the patterns from blader/humanizer (MIT) as the brief.
// Code then checks the rewrite kept every fact and added none. If any check fails, the
// rule-built letter is sent unchanged.

import E from "./engine.js";
import { ask, type Provider } from "./ai.ts";

type Fetcher = typeof fetch;
export type Humanized = { body: string; source: "ai" | "rules"; provider?: string; note?: string };

const BRIEF = [
  "You edit a job application email so it reads like the applicant wrote it, not a template or a chatbot.",
  "Keep every fact: each skill, tool, employer, result, number, link and date stays, worded your way. Add none.",
  "Keep the first line (the greeting) exactly. Keep the sign-off and the name under it exactly.",
  "Keep any line that starts with 'P.S. I read the whole post' exactly. Keep the sentence 'My CV is attached as a PDF.'",
  "Keep every link exactly as written.",
  "Cut these: 'not X but Y' contrasts; run-ups like 'Here's the thing'; a closing line that repeats the point;",
  "lists of three made up to sound complete; stock words (passionate, excited, eager, leverage, seamless, robust, crucial,",
  "enhance, showcase, pivotal, truly, deeply); 'serves as' in place of 'is'; em dashes; bold; bullet points that only",
  "restate the post. Turn bullets into one or two plain sentences when that reads better.",
  "Mix short and long sentences. Plain English, active voice, grade 7 reading level. 120 to 260 words.",
  'Reply with JSON only: {"body": "..."}',
].join("\n");

const NUMBER = /\d[\d.,%]*/g;
const URL_RE = /https?:\/\/[^\s)>\]]+/g;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function buildHumanizePrompt(body: string, voice: string, fix?: string, partial = false): { system: string; user: string } {
  const sample = voice.trim().slice(0, 1500);
  const brief = partial ? BRIEF.replace("Keep the sign-off and the name under it exactly.", "This is the letter without its sign-off; do not add one.").replace("120 to 260 words", "100 to 220 words") : BRIEF;
  const system = sample
    ? `${brief}\nMatch the applicant's own writing below: sentence length, word choice, how they open and link sentences. Their habits win over the rules above, except: never add a fact.\n\nTheir writing:\n${sample}`
    : brief;
  return { system, user: [fix ? `Your last version failed this check, fix it: ${fix}` : "", "The email:", body].filter(Boolean).join("\n") };
}

// Model text uses typographer's dashes and quotes that read as machine-made; these are the plain ones.
export const plain = (t: string) =>
  t
    .replace(/\r/g, "")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/\s[\u2013\u2014]\s/g, ", ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function parseBody(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as { body?: unknown };
    if (typeof v.body !== "string" || !v.body.trim()) return null;
    return `${plain(v.body)}\n`;
  } catch {
    return null;
  }
}

const lintCount = (s: string) => (E.lint(s) as string[]).filter((w) => !/Over half|lists of three|The letter is/.test(w));

// Returns what is wrong, or "" when the rewrite is safe to send.
export function checkRewrite(before: string, after: string, partial = false): string {
  const lines = before.trim().split("\n");
  const greeting = lines[0].trim();
  if (after.trim().split("\n")[0].trim() !== greeting) return `The first line must stay "${greeting}".`;
  const signName = lines[lines.length - 1].trim();
  if (!partial && signName && !after.trimEnd().endsWith(signName)) return `It must end with the name "${signName}".`;
  if (partial && /^(Best|Thank you|Thanks|Regards|Warm regards|Best regards|Kind regards),?$/m.test(after)) return "Do not add a sign-off.";
  for (const keep of [/^P\.S\. I read the whole post.*$/m, /My CV is attached as a PDF\./]) {
    const m = before.match(keep);
    if (m && !after.includes(m[0])) return `Keep this line exactly: ${m[0]}`;
  }
  for (const u of before.match(URL_RE) ?? []) if (!after.includes(u)) return `Keep the link ${u}.`;
  for (const u of after.match(URL_RE) ?? []) if (!before.includes(u)) return `It adds the link ${u}, which was not in the email.`;
  const known = before.toLowerCase();
  const badNumber = (after.match(NUMBER) ?? []).map((n) => n.replace(/[.,]$/, "")).find((n) => !known.includes(n));
  if (badNumber) return `It names the number ${badNumber}, which was not in the email.`;
  const prose = after.replace(URL_RE, "");
  const names = [...prose.matchAll(/(?<![.!?:]\s|^|\n)\b([A-Z][A-Za-z0-9+#.]*[A-Za-z0-9+#])/g)].map((m) => m[1]).filter((w) => w !== "I");
  const badName = names.find((n) => !new RegExp(`(^|[^a-z0-9])${esc(n.toLowerCase())}(?![a-z0-9])`).test(known));
  if (badName) return `It names "${badName}", which was not in the email.`;
  if (/\[[^\]\n]+\]/.test(after)) return "It has a [bracket] gap.";
  const n = words(after);
  if (n < Math.min(80, words(before) * 0.6) || n > Math.max(280, words(before) * 1.2)) return `It must be ${partial ? "100 to 220" : "120 to 260"} words; it was ${n}.`;
  const lint = lintCount(after);
  if (lint.length > lintCount(before).length || lint.some((w) => /AI-sounding|em dash|not X|chatbot|run-up|saying|defence/.test(w))) return lint.join(" ");
  return "";
}

// The proof list, the CV line and the sign-off stay exactly as built; only the letter above them is rewritten.
export function splitLetter(body: string): { main: string; tail: string } {
  const at = body.search(/^(Work you can check:|My CV is attached as a PDF\.)/m);
  if (at <= 0) return { main: body, tail: "" };
  return { main: `${body.slice(0, at).trimEnd()}\n`, tail: body.slice(at) };
}

export async function humanizeLetter(body: string, voice: string, providers: Provider[], fetcher: Fetcher = fetch): Promise<Humanized> {
  if (!providers.length) return { body, source: "rules", note: "AI is off, so the plain letter was kept." };
  const { main, tail } = splitLetter(body);
  if (!tail) return rewrite(body, body, "", voice, providers, fetcher);
  return rewrite(body, main, tail, voice, providers, fetcher);
}

async function rewrite(full: string, body: string, tail: string, voice: string, providers: Provider[], fetcher: Fetcher): Promise<Humanized> {
  let fix = "";
  const errors: string[] = [];
  for (const p of providers) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { system, user } = buildHumanizePrompt(body, voice, fix, Boolean(tail));
        const out = parseBody(await ask(p, system, user, fetcher, 900, 0.6));
        if (!out) {
          fix = "Reply with the JSON object only.";
          continue;
        }
        fix = checkRewrite(body, out, Boolean(tail));
        if (!fix) return { body: tail ? `${out.trimEnd()}\n\n${tail}` : out, source: "ai", provider: `${p.name} · ${p.model}` };
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        break;
      }
    }
  }
  return { body: full, source: "rules", note: fix ? `The rewrite failed a check (${fix}), so the plain letter was kept.` : `The AI was not reachable (${errors.join("; ") || "no answer"}), so the plain letter was kept.` };
}
