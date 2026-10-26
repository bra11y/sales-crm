// A first draft of a scholarship personal statement, built only from your fact bank.
// The parts only you can write (why this programme, your plan after) are left in
// [square brackets] for you to fill. Nothing is made up.

import { DOC_LABEL, type DocKind } from "./documents.ts";
import type { Step } from "./grow.ts";

type Facts = {
  person: Record<string, string>;
  education?: Edu | Edu[];
  jobs?: { title: Record<string, string> | string; org: string; dates: string; bullets?: { text: string }[] }[];
  certifications?: unknown[];
};
type Edu = { degree?: string; school?: string; dates?: string };
export type ScholarshipInfo = { name: string; place: string | null; level: string | null; deadline: string | null; url: string | null; needs: DocKind[] };

const titleOf = (t: Record<string, string> | string) => (typeof t === "string" ? t : (Object.values(t)[0] ?? ""));
const org = (s: string) => s.split("|")[0].trim();

// "2027 Gates Cambridge Scholarship in UK | Fully Funded" -> "Gates Cambridge Scholarship in UK".
export const programmeName = (title: string) =>
  title
    .replace(/\s*[|(].*$/, "")
    .replace(/^\d{4}(\/\d{2,4})?\s+/, "")
    .replace(/\s+\d{4}(\/\d{2,4})?$/, "")
    .trim() || title;

const LEVEL_WORD: Record<string, string> = { masters: "master's", "master's": "master's", phd: "PhD", undergraduate: "undergraduate", "short course": "short course" };

export function draftStatement(f: Facts, scholarship: ScholarshipInfo): string {
  const s = { ...scholarship, name: programmeName(scholarship.name) };
  const p = f.person;
  const edu = Array.isArray(f.education) ? f.education[0] : f.education;
  const job = f.jobs?.[0];
  const result = job?.bullets
    ?.find((b) => /\d/.test(b.text))
    ?.text.replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\.$/, "");
  const study = (s.level && LEVEL_WORD[s.level.toLowerCase()]) || "study";
  // "in the UK", "in Germany".
  const where = s.place ? ` in ${/^(uk|us|usa|united|netherlands|philippines|gambia)/i.test(s.place) ? "the " : ""}${s.place}` : "";
  return [
    `I am ${p.name || "[your name]"}${p.location ? `, from ${p.location}` : ""}. I am applying for the ${s.name} because [one sentence: the problem you want to work on, and why this programme fits it].`,
    "",
    edu?.degree
      ? `I studied ${edu.degree} at ${edu.school}${edu.dates ? ` (${edu.dates})` : ""}. [Name one course, project or result from your degree that led you here.]`
      : "[Your degree, school and years, and one result from your studies.]",
    "",
    job
      ? `Since then I have worked as ${titleOf(job.title)} at ${org(job.org)}.${result ? ` One result I am proud of: ${result.charAt(0).toLowerCase()}${result.slice(1)}.` : ""} [Say what you learned from it, in one or two sentences.]`
      : "[Your work or volunteering since your degree, with one result you can measure.]",
    "",
    `${study === "study" ? "Studying" : `A ${study} place`}${where} would give me [the specific skill, course or lab you want, by name]. I chose this programme over others because [a fact about it from its official page].`,
    "",
    `After I finish, I plan to [your plan, with a place and a first step]. This is how the ${s.name} would help me give back: [who benefits, and how].`,
    "",
    "[Read it aloud. Cut any sentence that could be in anyone's statement. Keep it within the word limit on the official page.]",
  ].join("\n");
}

// The steps for this application: the official page, each document it asks for (ticked
// when it is already in Documents), referees, the statement, and submitting before the deadline.
export function applicationSteps(s: ScholarshipInfo, have: DocKind[]): Step[] {
  const needs = [...new Set<DocKind>([...s.needs, "cv", "transcript", "passport"])];
  return [
    { text: `Read the official rules${s.url ? ` at ${s.url.replace(/^https?:\/\//, "").slice(0, 80)}` : ""} and check you meet each one`, done: false },
    ...needs.map((k) => ({ text: have.includes(k) ? `${DOC_LABEL[k]}: in your Documents` : `Upload your ${DOC_LABEL[k].toLowerCase()} on the Documents page`, done: have.includes(k) })),
    ...(needs.includes("recommendation") ? [{ text: "Ask two referees, at least 3 weeks before the deadline", done: false }] : []),
    { text: "Finish the personal statement draft below", done: false },
    { text: "Run the statement through the writing check in the extension", done: false },
    { text: `Submit${s.deadline ? ` before ${s.deadline}` : ""}, and save the confirmation email`, done: false },
  ].slice(0, 30);
}
