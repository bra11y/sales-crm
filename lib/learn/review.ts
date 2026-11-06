// Notes come back for review after 1, 3, 7, 21 and 60 days, so what you learn sticks.

export const INTERVALS = [1, 3, 7, 21, 60] as const;
const DAY = 86_400_000;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function firstReview(now = new Date()): { step: number; due: string } {
  return { step: 0, due: isoDay(new Date(now.getTime() + INTERVALS[0] * DAY)) };
}

// "Remembered" moves the note to the next wait; "Again" starts over tomorrow. After the last
// wait the note is learned and does not come back (due is null).
export function nextReview(step: number, result: "remembered" | "again", now = new Date()): { step: number; due: string | null } {
  if (result === "again") return firstReview(now);
  const next = step + 1;
  if (next >= INTERVALS.length) return { step: INTERVALS.length, due: null };
  return { step: next, due: isoDay(new Date(now.getTime() + INTERVALS[next] * DAY)) };
}

export function isDue(due: string | null, now = new Date()): boolean {
  return due !== null && due <= isoDay(now);
}

export function reviewLabel(step: number, due: string | null, now = new Date()): string {
  if (due === null) return step >= INTERVALS.length ? "Learned" : "Not set to review";
  if (isDue(due, now)) return "Due for review today";
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${isoDay(now)}T00:00:00Z`)) / DAY);
  return days === 1 ? "Review tomorrow" : `Review in ${days} days`;
}
