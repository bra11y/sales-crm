// Sets up a Profile from someone's own CV. A model reads the CV into the Profile's shape, then
// code checks every line against the CV: a job, school, number or link that is not in the CV
// is dropped. The import only fills what is empty and adds what is new, so nothing you wrote
// by hand is overwritten.

import type { StoredFacts } from "./facts.ts";

export type CvRead = {
  person: Record<string, string>;
  skills: Record<string, string[]>;
  jobs: { org: string; title: string; dates: string; bullets: string[] }[];
  education: { degree: string; dates: string; school: string };
  certifications: string[];
  projects: string[];
  tracks: Record<string, { profile: string; hook: string; story: string }>;
  // Up to 5 job titles this person's experience fits, as job boards write them.
  targets: string[];
};

export const PERSON_KEYS = ["name", "email", "phone", "location", "linkedin", "portfolio"] as const;

export function cvPrompt(cv: string, facts: StoredFacts): { system: string; user: string } {
  const groups = facts.skills.map((g) => g.group);
  const tracks = Object.entries(facts.tracks).map(([id, t]) => `${id} (${t.label})`);
  const system = [
    "You read a person's CV and copy its facts into a fixed JSON shape. You never add anything that is not in the CV.",
    "Rules:",
    "- Copy names of employers, schools, job titles, dates, numbers and links exactly as the CV writes them.",
    "- Each result bullet is one true line from the CV, rewritten in plain English that starts with a past-tense verb. Keep every number. Never add a number.",
    "- Put each skill in the group it fits best. Only skills the CV names.",
    "- Always write the general role type (Your field), aimed at the jobs in targets.",
    "- For each other role type the person's experience supports, write: profile (2 to 3 sentences in the first person, from CV facts only, with their strongest number), hook (one sentence with their strongest true results), story (2 sentences: one real example from the CV with its result). Leave out role types the CV does not support.",
    "- targets: up to 5 job titles this person is ready to apply for today, as job posts write them (for example Virtual Assistant, Customer Support Specialist, Frontend Developer). Base them on their real experience, not hopes.",
    "- Plain words. No em dashes. Never use: passionate, results-driven, dynamic, leverage, seamless, robust, synergy, spearheaded.",
    "Reply with JSON only:",
    `{"person":{"name":"","email":"","phone":"","location":"","linkedin":"","portfolio":""},"skills":{${groups.map((g) => `"${g}":[]`).join(",")},"Other":[]},"jobs":[{"org":"","title":"","dates":"","bullets":[""]}],"education":{"degree":"","dates":"","school":""},"certifications":[""],"projects":[""],"tracks":{"<role type id>":{"profile":"","hook":"","story":""}},"targets":[""]}`,
    `Role type ids: ${tracks.join(", ")}`,
  ].join("\n");
  return { system, user: `CV:\n${cv.slice(0, 24_000)}` };
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*—\s*/g, " - ").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => s(x, max)).filter(Boolean).slice(0, n) : []);
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9@.+%]+/g, " ").replace(/\s+/g, " ").trim();

// True when the text's names and numbers all appear in the CV.
export function backedBy(line: string, cv: string): boolean {
  const hay = norm(cv);
  const numbers = line.match(/\d[\d.,]*%?/g) ?? [];
  if (numbers.some((n) => !hay.includes(norm(n.replace(/[.,]$/, ""))))) return false;
  return true;
}

export function readCv(v: Record<string, unknown>, cv: string, trackIds: string[]): CvRead | null {
  const hay = norm(cv);
  const inCv = (t: string) => Boolean(t) && hay.includes(norm(t));
  const p = (v.person ?? {}) as Record<string, unknown>;
  const person: Record<string, string> = {};
  for (const k of PERSON_KEYS) {
    const val = s(p[k], 300);
    // Contact details must be in the CV word for word; links may lose their https://.
    if (val && inCv(val.replace(/^https?:\/\/(www\.)?/i, ""))) person[k] = k === "linkedin" || k === "portfolio" ? (/^https?:\/\//.test(val) ? val : `https://${val}`) : val;
  }
  const skills: Record<string, string[]> = {};
  for (const [g, items] of Object.entries((v.skills ?? {}) as Record<string, unknown>)) {
    const kept = list(items, 30, 60).filter(inCv);
    if (kept.length) skills[s(g, 60)] = kept;
  }
  const jobs = (Array.isArray(v.jobs) ? v.jobs : [])
    .map((j) => j as Record<string, unknown>)
    .map((j) => ({ org: s(j.org, 200), title: s(j.title, 200), dates: s(j.dates, 60), bullets: list(j.bullets, 8, 300).filter((b) => backedBy(b, cv)) }))
    // The employer and the title must both be in the CV, so a name seen elsewhere (like a
    // certificate's issuer) never becomes a job.
    .filter((j) => j.org && j.title && inCv(j.org) && inCv(j.title))
    .slice(0, 12);
  const e = (v.education ?? {}) as Record<string, unknown>;
  const education = { degree: s(e.degree, 200), dates: s(e.dates, 60), school: s(e.school, 200) };
  if (education.school && !inCv(education.school)) Object.assign(education, { degree: "", dates: "", school: "" });
  const tracks: CvRead["tracks"] = {};
  for (const [id, t] of Object.entries((v.tracks ?? {}) as Record<string, Record<string, unknown>>)) {
    if (!trackIds.includes(id) || !t) continue;
    const one = { profile: s(t.profile, 900), hook: s(t.hook, 400), story: s(t.story, 600) };
    if (one.profile && backedBy(`${one.profile} ${one.hook} ${one.story}`, cv)) tracks[id] = one;
  }
  const read: CvRead = {
    person,
    skills,
    jobs,
    education,
    certifications: list(v.certifications, 12, 300).filter((c) => backedBy(c, cv)),
    projects: list(v.projects, 8, 300).filter((c) => backedBy(c, cv)),
    tracks,
    targets: list(v.targets, 5, 60).map((t) => t.replace(/[^\p{L}\p{N} &/+#.-]/gu, "").trim()).filter(Boolean),
  };
  return read.jobs.length || Object.keys(read.skills).length || read.person.name ? read : null;
}

const key = (t: string) => norm(t).replace(/\s/g, "");

// Fills what is empty and adds what is new. Returns the new facts and what changed, in words.
export function mergeCv(facts: StoredFacts, cv: CvRead): { facts: StoredFacts; added: string[] } {
  const f = structuredClone(facts);
  const added: string[] = [];
  const filled = PERSON_KEYS.filter((k) => cv.person[k] && !f.person[k]?.trim());
  for (const k of filled) f.person[k] = cv.person[k];
  if (filled.length) added.push(`${filled.length} contact detail${filled.length > 1 ? "s" : ""}`);

  let skillCount = 0;
  const have = new Set(f.skills.flatMap((g) => g.items.map((i) => key(i.label))));
  for (const [group, items] of Object.entries(cv.skills)) {
    let g = f.skills.find((x) => x.group.toLowerCase() === group.toLowerCase());
    if (!g) {
      g = { group: group === "Other" ? "More skills" : group, items: [] };
      f.skills.push(g);
    }
    for (const label of items) {
      if (have.has(key(label))) continue;
      have.add(key(label));
      g.items.push({ label, aliases: [label.toLowerCase()] });
      skillCount++;
    }
  }
  if (skillCount) added.push(`${skillCount} skill${skillCount > 1 ? "s" : ""}`);

  const trackIds = Object.keys(f.tracks);
  let jobCount = 0;
  for (const j of cv.jobs) {
    if (f.jobs.some((x) => key(x.org) === key(j.org) && key(x.dates) === key(j.dates))) continue;
    f.jobs.push({ org: j.org, dates: j.dates, max: 5, title: Object.fromEntries(trackIds.map((t) => [t, j.title])), bullets: j.bullets.map((text) => ({ text, tags: [] })) });
    jobCount++;
  }
  if (jobCount) added.push(`${jobCount} job${jobCount > 1 ? "s" : ""}`);

  if (cv.education.school && !f.education?.school) {
    f.education = cv.education;
    added.push("education");
  }
  const certs = cv.certifications.filter((c) => !f.certifications.some((x) => key(x) === key(c)));
  f.certifications.push(...certs);
  if (certs.length) added.push(`${certs.length} certification${certs.length > 1 ? "s" : ""}`);
  const projects = cv.projects.filter((c) => !f.projects.some((x) => key(x.text) === key(c)));
  f.projects.push(...projects.map((text) => ({ text, tracks: trackIds })));
  if (projects.length) added.push(`${projects.length} project${projects.length > 1 ? "s" : ""}`);

  let wrote = 0;
  for (const [id, t] of Object.entries(cv.tracks)) {
    const now = f.tracks[id];
    if (!now) continue;
    if (!now.profile.trim()) {
      Object.assign(now, { profile: t.profile, hook: now.hook || t.hook, story: now.story || t.story });
      wrote++;
    }
  }
  if (wrote) added.push(`a profile summary for ${wrote} role type${wrote > 1 ? "s" : ""}`);
  return { facts: f, added };
}

// What a new Profile still needs, so the page can say it plainly.
export function setupSteps(f: StoredFacts): { label: string; done: boolean; href: string }[] {
  return [
    { label: "Your name and email", done: Boolean(f.person.name?.trim() && f.person.email?.trim()), href: "#profile-name" },
    { label: "At least 5 skills", done: f.skills.reduce((n, g) => n + g.items.length, 0) >= 5, href: "#skills" },
    { label: "One job or project with a result", done: f.jobs.some((j) => j.bullets.length > 0) || f.projects.length > 0, href: "#experience" },
    { label: "A profile summary", done: Object.values(f.tracks).some((t) => t.profile.trim()), href: "#tracks" },
    { label: "Education or a certificate", done: Boolean(f.education?.school?.trim()) || f.certifications.length > 0, href: "#more" },
  ];
}
