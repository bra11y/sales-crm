// Five mindsets, one for each day in turn. Each has a line to remember and one thing to do today.

export type Mindset = { name: string; line: string; today: string };

export const MINDSETS: Mindset[] = [
  { name: "Shark", line: "A shark that stops swimming dies. Keep moving: learn, train, build.", today: "Learn one new thing and use it before tonight." },
  { name: "Falcon", line: "A falcon locks onto one target and ignores the rest. Focus is your unfair edge.", today: "Pick the one task that matters most and finish it first." },
  { name: "Bison", line: "Bison run into the storm, not away from it. Face the hard thing early.", today: "Do the task you have been putting off, before noon." },
  { name: "Fox", line: "A fox survives by adapting. Work hard, and think about where the work is going.", today: "Check that today's work moves your main goal forward." },
  { name: "Ant", line: "Ants don't wait to feel like it. Small work, every day, for years.", today: "Do one small piece of your goal, even if it is only 20 minutes." },
];

// The same mindset all day, wherever you open the app. Counted in Lagos time.
export function mindsetFor(date = new Date()): Mindset {
  const lagos = new Date(date.getTime() + 60 * 60 * 1000);
  const day = Math.floor(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) / 86_400_000);
  return MINDSETS[day % MINDSETS.length];
}

export const dayKey = (date = new Date()) => new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
