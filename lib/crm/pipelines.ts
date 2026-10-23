// Stages for these products are yours to move. The others come from each app's billing events.
export const EDITABLE_PRODUCTS: readonly string[] = ["applications", "direct"];

// No activity for this many days on an open company means it is slipping.
export const SLIPPING_DAYS = 14;

const CLOSED = new Set(["Won", "Closed", "Cancelled", "Locked", "Paying", "Client", "Pro"]);

export function isOpenStage(stage: string | null | undefined): boolean {
  return Boolean(stage) && !CLOSED.has(stage!);
}

export function isSlipping(c: { stage?: string | null; activityDays: number }): boolean {
  return isOpenStage(c.stage) && c.activityDays >= SLIPPING_DAYS;
}

// Sidebar dot colours per pipeline, in a fixed order (never cycled by rank).
export const PIPELINE_TONES = ["#3987e5", "#199e70", "#c98500", "#d55181", "#9085e9", "#d95926"];
