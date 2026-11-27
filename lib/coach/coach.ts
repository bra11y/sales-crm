// Job-search coaching, from 20 prompts people share for ChatGPT and Claude, folded into seven
// tools that already know your Profile and your saved jobs. Every tool is told never to invent
// experience, and code drops any line that names a number your Profile does not have.

export type ToolId = "decode" | "shortlist" | "interview" | "feedback" | "achievements" | "outreach" | "linkedin" | "plan";
export type Needs = "job" | "role" | "answer" | "none";
export type Tool = { id: ToolId; title: string; what: string; needs: Needs; button: string };
export type Section = { title: string; items: string[] };
export type Coached = { sections: Section[]; score?: number };

export const TOOLS: Tool[] = [
  { id: "shortlist", title: "Would they shortlist me?", what: "A skeptical hiring manager scores your Profile against one job out of 100, says what would get you a call and what would get you rejected, and gives 5 changes.", needs: "job", button: "Score me for this job" },
  { id: "decode", title: "Decode a job post", what: "The 10 things this employer wants most, ranked, the expectations they did not write down, and the keywords to use.", needs: "job", button: "Decode this job" },
  { id: "interview", title: "Practise the interview", what: "10 realistic questions for this job, behavioural ones in STAR form. Answer each one and get feedback.", needs: "job", button: "Give me the questions" },
  { id: "achievements", title: "Find my achievements", what: "Questions that pull out results you forgot: time saved, money made, problems fixed. Your answers become CV bullets.", needs: "none", button: "Ask me" },
  { id: "outreach", title: "Messages to recruiters", what: "5 short LinkedIn messages for one role: friendly, specific, about what you can do for them.", needs: "role", button: "Write the messages" },
  { id: "linkedin", title: "Fix my LinkedIn", what: "A headline, an About section and a line for each job about who you are and how you work, not a list of wins. Shared work is credited as shared.", needs: "none", button: "Write my LinkedIn" },
  { id: "plan", title: "My 7-day plan", what: "A day-by-day plan for one target role: searching, applying, people to reach, CV work and interview practice.", needs: "role", button: "Make my plan" },
];

const RULES = [
  "Use only facts from the applicant's Profile. Never invent an employer, title, degree, certificate, number or result.",
  "When the job wants something the Profile does not show, never write it as a line to paste. Write it as a question that starts 'Only if true:', for example 'Only if true: have you trained developers? Then add one line saying who and when.'",
  "Something in progress stays in progress. Never turn a course, certificate or skill in progress into a finished one.",
  "Plain English, short sentences, active voice. No em dashes. No 'passionate', 'leverage', 'dynamic', 'synergy'.",
];

const SHAPE = (sections: string, extra = "") => `Reply with JSON only: {${extra}"sections":[{"title":"...","items":["..."]}]} with these sections in order: ${sections}.`;

export function coachPrompt(tool: ToolId, input: { profile: string; job?: string; role?: string; question?: string; answer?: string }): { system: string; user: string } {
  const job = input.job ? `The job post:\n${input.job.slice(0, 8000)}` : "";
  const role = input.role ? `Target role: ${input.role}` : "";
  const profile = `The applicant's Profile:\n${input.profile}`;
  const s = (lines: string[]) => [...lines, ...RULES].join("\n");
  switch (tool) {
    case "decode":
      return {
        system: s(["You are a hiring manager explaining your own job post to a candidate.", SHAPE("Top 10 qualifications ranked (each: what, and why it ranks there); Hidden expectations; Keywords to use; The ideal candidate in 3 lines")]),
        user: [job].join("\n\n"),
      };
    case "shortlist":
      return {
        system: s([
          "You are a skeptical hiring manager who has hired for this role for 10 years and reviews 200 applications a week.",
          SHAPE("Why I would call you; What would make me reject you; Missing keywords; 5 changes to make (rewrite or move lines already in the Profile; anything new starts 'Only if true:')", '"score":0-100,'),
        ]),
        user: [job, profile].join("\n\n"),
      };
    case "interview":
      return {
        system: s(["You are the hiring manager interviewing the applicant for this job.", SHAPE("Questions about the role (5); Behavioural questions, answer with STAR (5); What a strong answer shows")]),
        user: [job, profile].join("\n\n"),
      };
    case "feedback":
      return {
        system: s(["You are the hiring manager. Judge one interview answer honestly and kindly.", SHAPE("What worked; What was missing (Situation, Task, Action, Result); A stronger answer using only what they said and their Profile", '"score":0-10,')]),
        user: [job, `Question: ${input.question ?? ""}`, `Their answer: ${input.answer ?? ""}`, profile].join("\n\n"),
      };
    case "achievements":
      return {
        system: s(["You are a career coach who uncovers achievements people forget to mention.", SHAPE("Questions about each job (2 to 3 each, naming the job); Questions about projects; Results to look for (time saved, money, errors fixed, people helped)")]),
        user: profile,
      };
    case "outreach":
      return {
        system: s(["You write LinkedIn messages to recruiters. Each under 300 characters, warm, specific, ending with one easy question.", SHAPE("5 messages; When to send and how to follow up")]),
        user: [role, profile].join("\n\n"),
      };
    case "linkedin":
      return {
        system: s([
          "You help someone write a LinkedIn profile that says who they are, what they care about and how they work. It is not a list of wins.",
          "Lead with what they believe and the people they serve. Describe the work, not trophies.",
          "Never claim a result as theirs alone. Work done with a team or client is written as 'we' or 'I am part of a team that'. Leave out numbers and metrics unless the Profile says they did it alone.",
          "Modest, warm, first person. No 'I did, I built, I cut' lists. No superlatives.",
          SHAPE("Headline (3 options, under 220 characters, about what they do and for whom); About (one version, 120 to 200 words, first person: what they believe, the work, how they work, what they are open to); A line for each job (job name, then 2 to 3 lines on what the work is and what they care about in it); Skills to list (10)"),
        ]),
        user: profile,
      };
    case "plan":
      return {
        system: s(["You are a job-search coach. Make a realistic plan for someone with a full-time week.", SHAPE("Day 1; Day 2; Day 3; Day 4; Day 5; Day 6; Day 7 (each day: 3 to 5 tasks covering search, applications, people to reach, CV work and interview practice)")]),
        user: [role, profile].join("\n\n"),
      };
  }
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s[–—]\s/g, ", ").replace(/\*\*/g, "").trim().slice(0, max) : "");

export function readCoached(v: Record<string, unknown>): Coached | null {
  const raw = Array.isArray(v.sections) ? v.sections : [];
  const sections = raw
    .map((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return { title: clean(o.title, 120), items: (Array.isArray(o.items) ? o.items : []).map((i) => clean(i, 1500)).filter(Boolean).slice(0, 15) };
    })
    .filter((x) => x.title && x.items.length)
    .slice(0, 10);
  if (!sections.length) return null;
  const score = Number(v.score);
  return { sections, ...(Number.isFinite(score) && score >= 0 && score <= 100 ? { score: Math.round(score) } : {}) };
}

// A line that states a number neither the Profile nor the job has is dropped, with a note.
export function dropInvented(c: Coached, known: string): { coached: Coached; dropped: number } {
  const facts = known.toLowerCase().replace(/,(?=\d{3})/g, "");
  let dropped = 0;
  const sections = c.sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        const nums = (i.match(/\d[\d.,]*%?/g) ?? []).map((n) => n.replace(/[.,]+$/, "").replace(/,(?=\d{3})/g, "")).filter((n) => n.length > 1 || /%/.test(n));
        const ok = nums.every((n) => facts.includes(n.toLowerCase()));
        if (!ok) dropped++;
        return ok;
      }),
    }))
    .filter((s) => s.items.length);
  return { coached: { ...c, sections }, dropped };
}

// A suggested line that claims something not in the Profile must be asked, not stated. Lines that
// tell you to add a certificate, year or title the Profile lacks, without "Only if true", go.
export function dropUnaskedClaims(c: Coached, known: string): { coached: Coached; dropped: number } {
  const facts = known.toLowerCase();
  let dropped = 0;
  const sections = c.sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        if (/^only if true/i.test(i) || !/\b(add|list|write|put)\b/i.test(i)) return true;
        const quoted = [...i.matchAll(/"([^"]{6,})"/g)].map((m) => m[1].toLowerCase());
        const claims = /\b(completed|certified|certification|certificate|led|managed|trained|built|launched)\b/i;
        const bad = quoted.some((q) => claims.test(q) && !q.split(/[^a-z0-9]+/).filter((w) => w.length > 4).every((w) => facts.includes(w)));
        if (bad) dropped++;
        return !bad;
      }),
    }))
    .filter((s) => s.items.length);
  return { coached: { ...c, sections }, dropped };
}

// Tools that write about you (not about the job) may only use numbers you gave.
export const WRITES_ABOUT_YOU: ToolId[] = ["shortlist", "feedback", "outreach", "linkedin"];
