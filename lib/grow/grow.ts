// Scholarships and your own goals: plain rules shared by the pages and their actions.

export type Step = { text: string; done: boolean };
export type Scholarship = {
  id: string;
  name: string;
  provider: string | null;
  url: string | null;
  level: Level;
  country: string | null;
  amount: string | null;
  deadline: string | null;
  status: ScholarshipStatus;
  steps: Step[];
  note: string | null;
};
export type CareerGoal = { id: string; title: string; horizon: "short" | "long"; due_on: string | null; why: string | null; steps: Step[]; done_at: string | null };

export const LEVELS = ["any", "undergraduate", "masters", "phd", "short course"] as const;
export type Level = (typeof LEVELS)[number];
export const STATUSES = ["interested", "preparing", "applied", "interview", "won", "lost"] as const;
export type ScholarshipStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<ScholarshipStatus, string> = { interested: "Interested", preparing: "Preparing", applied: "Applied", interview: "Interview", won: "Won", lost: "Not this time" };
export const LEVEL_LABEL: Record<Level, string> = { any: "Any level", undergraduate: "Undergraduate", masters: "Master's", phd: "PhD", "short course": "Short course" };

// What almost every scholarship asks for. Edit or tick off per scholarship.
export const SCHOLARSHIP_STEPS = [
  "Check you meet every eligibility rule",
  "Get your transcripts and certificates",
  "Ask two referees, at least 3 weeks before the deadline",
  "Write the personal statement",
  "Run the statement through the writing check",
  "Submit, and save the confirmation email",
];

// Starting steps for a goal, so a big goal becomes something to do this week.
export function goalSteps(horizon: "short" | "long"): string[] {
  return horizon === "short"
    ? ["Write what done looks like, in one sentence", "Do the first small step this week", "Check progress every Friday"]
    : ["Write what done looks like, in one sentence", "Break it into 3 short-term goals", "Pick the first one and start it", "Review this goal at the end of each month"];
}

export const steps = (texts: string[]): Step[] => texts.map((text) => ({ text, done: false }));

// Whole days from today to the date; negative once it has passed.
export function daysLeft(date: string | null, now = new Date()): number | null {
  if (!date) return null;
  const end = Date.parse(`${date}T23:59:59Z`);
  if (!Number.isFinite(end)) return null;
  return Math.floor((end - now.getTime()) / 86_400_000);
}

export function dueText(date: string | null, now = new Date()): string {
  const d = daysLeft(date, now);
  if (d === null) return "No deadline set";
  if (d < 0) return `Closed ${-d} ${-d === 1 ? "day" : "days"} ago`;
  if (d === 0) return "Closes today";
  if (d === 1) return "Closes tomorrow";
  return `${d} days left`;
}

// Open ones first, soonest deadline first; finished ones last.
export function sortScholarships<T extends Pick<Scholarship, "deadline" | "status">>(list: T[], now = new Date()): T[] {
  const rank = (s: T) => (s.status === "won" || s.status === "lost" ? 2 : (daysLeft(s.deadline, now) ?? 9999) < 0 ? 1 : 0);
  return [...list].sort((a, b) => rank(a) - rank(b) || (daysLeft(a.deadline, now) ?? 9999) - (daysLeft(b.deadline, now) ?? 9999));
}

export const progress = (s: Step[]) => (s.length ? Math.round((s.filter((x) => x.done).length / s.length) * 100) : 0);

// Checks a step list from a form before it is saved.
export function cleanSteps(raw: unknown): Step[] | null {
  if (!Array.isArray(raw) || raw.length > 30) return null;
  const out: Step[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") return null;
    const text = String((s as Step).text ?? "")
      .trim()
      .slice(0, 200);
    if (text) out.push({ text, done: Boolean((s as Step).done) });
  }
  return out;
}

// Big, long-running programmes with their official sites. Check each site for this year's dates.
export const SOURCES = [
  { name: "Chevening", where: "UK", level: "Master's", url: "https://www.chevening.org" },
  { name: "Commonwealth Scholarships", where: "UK", level: "Master's and PhD", url: "https://cscuk.fcdo.gov.uk" },
  { name: "DAAD", where: "Germany", level: "Master's and PhD", url: "https://www.daad.de/en/" },
  { name: "Fulbright Foreign Student Program", where: "USA", level: "Master's and PhD", url: "https://foreign.fulbrightonline.org" },
  { name: "Erasmus Mundus", where: "Europe", level: "Master's", url: "https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en" },
  { name: "Mastercard Foundation Scholars", where: "Africa and abroad", level: "Undergraduate and Master's", url: "https://mastercardfdn.org" },
  { name: "Gates Cambridge", where: "UK", level: "Master's and PhD", url: "https://www.gatescambridge.org" },
  { name: "Rhodes Scholarship", where: "UK", level: "Master's and PhD", url: "https://www.rhodeshouse.ox.ac.uk" },
  { name: "MEXT (Study in Japan)", where: "Japan", level: "Undergraduate to PhD", url: "https://www.studyinjapan.go.jp/en/" },
  { name: "PTDF", where: "Nigeria", level: "Master's and PhD", url: "https://ptdf.gov.ng" },
] as const;
