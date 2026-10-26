// How senior a job is, from its title and the years of experience the post asks for.
// Plain rules: titles say it most of the time, and "5+ years" says the rest.

export const LEVELS = ["entry", "mid", "senior"] as const;
export type JobLevel = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<JobLevel, string> = { entry: "Entry level and graduate", mid: "Mid level", senior: "Senior and lead" };

const SENIOR_TITLE = /\b(senior|sr\.?|staff|principal|lead|head of|director|vp|vice president|chief|architect|distinguished)\b/i;
const ENTRY_TITLE = /\b(junior|jr\.?|entry[- ]level|graduate|grad|intern(ship)?|trainee|apprentice|new grad|early career|fresher|nysc|volunteer|assistant)\b/i;

// The smallest number of years the post asks for, such as 5 in "5+ years" or "5-7 years of experience".
export function yearsAsked(text: string): number | null {
  const found = [
    ...text.matchAll(/\b(\d{1,2})\s*(?:\+|-\s*\d{1,2}|to\s*\d{1,2})?\s*\+?\s*years?(?:'|’)?\s+(?:of\s+)?(?:professional\s+|relevant\s+|hands-on\s+|industry\s+|work\s+)?(?:experience|exp\b)/gi),
  ]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0 && n < 30);
  return found.length ? Math.min(...found) : null;
}

export function jobLevel(title: string, description = ""): { level: JobLevel; why: string } {
  if (ENTRY_TITLE.test(title)) return { level: "entry", why: "The title says it is an entry-level role" };
  if (SENIOR_TITLE.test(title)) return { level: "senior", why: "The title asks for a senior or lead person" };
  const years = yearsAsked(description);
  if (years !== null && years >= 6) return { level: "senior", why: `Asks for ${years}+ years of experience` };
  if (years !== null && years <= 2) return { level: "entry", why: `Asks for ${years} year${years === 1 ? "" : "s"} of experience` };
  return { level: "mid", why: years ? `Asks for ${years} years of experience` : "No level stated" };
}
