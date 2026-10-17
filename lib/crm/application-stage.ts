export const APPLICATION_STAGES = ["Drafted", "Applied", "Interview", "Offer", "Won", "Closed"] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const APPLICATION_PROBABILITY: Record<ApplicationStage, number> = {
  Drafted: 5,
  Applied: 10,
  Interview: 30,
  Offer: 70,
  Won: 100,
  Closed: 0,
};

type Change =
  | { ok: true; stage: ApplicationStage; winProbability: number; dealStatus: "open" | "won" | "lost"; summary: string }
  | { ok: false; error: string };

export function stageChange(stage: string, note: string): Change {
  if (!APPLICATION_STAGES.includes(stage as ApplicationStage)) return { ok: false, error: "Pick one of the application stages." };
  const text = note.trim();
  if (text.length > 500) return { ok: false, error: "Keep the note under 500 characters." };
  const s = stage as ApplicationStage;
  return {
    ok: true,
    stage: s,
    winProbability: APPLICATION_PROBABILITY[s],
    dealStatus: s === "Won" ? "won" : s === "Closed" ? "lost" : "open",
    summary: text ? `Moved to ${s}: ${text}` : `Moved to ${s}`,
  };
}
