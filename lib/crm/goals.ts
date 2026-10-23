// Goals: pure maths for progress, pace and history. Inputs are plain samples
// (one per payment, application, reply…), so the same code serves every measure.

export const METRICS = {
  revenue: { label: "Revenue collected", unit: "money", hint: "Paid payments from your apps." },
  new_paid: { label: "New paying customers", unit: "count", hint: "Companies that paid for the first time." },
  applications: { label: "Job applications sent", unit: "count", hint: "Emails sent and forms you marked as sent." },
  interviews: { label: "Interviews", unit: "count", hint: "Applications moved to Interview." },
  replies: { label: "Employer replies", unit: "count", hint: "Real replies to your applications, not auto-replies." },
  touches: { label: "Notes and calls logged", unit: "count", hint: "Notes you add to a company." },
} as const;

export type Metric = keyof typeof METRICS;
export type Period = "week" | "month" | "quarter";
export const PERIODS: Record<Period, string> = { week: "Each week", month: "Each month", quarter: "Each quarter" };

export type Goal = {
  id: string;
  metric: Metric;
  period: Period;
  target: number;
  currency: string | null;
  product: string | null;
  note: string | null;
  created_at: string;
};

export type Sample = { at: string; value: number; currency?: string; product?: string };

export type GoalStatus = "done" | "on_track" | "behind" | "early";

export type GoalProgress = {
  actual: number;
  target: number;
  pct: number;
  expected: number;
  status: GoalStatus;
  projected: number;
  daysLeft: number;
  needPerDay: number;
  label: string;
  history: { label: string; actual: number; hit: boolean; current: boolean }[];
  streak: number;
};

const DAY = 86_400_000;

// Weeks start on Monday. All bounds are UTC, like the rest of the sales figures.
export function periodBounds(period: Period, now: Date, back = 0): { from: Date; to: Date; label: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (period === "week") {
    const today = Date.UTC(y, m, now.getUTCDate());
    const monday = today - ((now.getUTCDay() + 6) % 7) * DAY - back * 7 * DAY;
    const from = new Date(monday);
    return { from, to: new Date(monday + 7 * DAY), label: `Week of ${from.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` };
  }
  if (period === "month") {
    const from = new Date(Date.UTC(y, m - back, 1));
    return { from, to: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)), label: from.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) };
  }
  const q = Math.floor(m / 3) - back;
  const from = new Date(Date.UTC(y, q * 3, 1));
  return { from, to: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 3, 1)), label: `Q${Math.floor(from.getUTCMonth() / 3) + 1} ${from.getUTCFullYear()}` };
}

export function samplesFor(goal: Pick<Goal, "currency" | "product">, samples: Sample[]): Sample[] {
  return samples.filter((s) => (!goal.currency || s.currency === goal.currency) && (!goal.product || s.product === goal.product));
}

function sumIn(samples: Sample[], from: Date, to: Date) {
  let total = 0;
  for (const s of samples) {
    const t = Date.parse(s.at);
    if (t >= from.getTime() && t < to.getTime()) total += s.value;
  }
  return total;
}

export function goalProgress(goal: Goal, all: Sample[], now: Date, periods = 6): GoalProgress {
  const samples = samplesFor(goal, all);
  const { from, to, label } = periodBounds(goal.period, now);
  const actual = sumIn(samples, from, to);
  const span = to.getTime() - from.getTime();
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - from.getTime()) / span));
  const expected = goal.target * elapsed;
  const daysLeft = Math.max(0, Math.ceil((to.getTime() - now.getTime()) / DAY));
  const remaining = Math.max(0, goal.target - actual);

  let status: GoalStatus;
  if (actual >= goal.target) status = "done";
  else if (elapsed < 0.15 && actual === 0) status = "early";
  else status = actual >= expected * 0.9 ? "on_track" : "behind";

  const history = [];
  for (let back = periods - 1; back >= 0; back--) {
    const b = periodBounds(goal.period, now, back);
    const value = sumIn(samples, b.from, b.to);
    history.push({ label: b.label, actual: value, hit: value >= goal.target, current: back === 0 });
  }
  let streak = 0;
  for (let i = history.length - 2; i >= 0 && history[i].hit; i--) streak++;

  return {
    actual,
    target: goal.target,
    pct: Math.round((actual / goal.target) * 100),
    expected,
    status,
    projected: elapsed > 0 ? Math.round(actual / elapsed) : 0,
    daysLeft,
    needPerDay: daysLeft ? remaining / daysLeft : remaining,
    label,
    history,
    streak,
  };
}

export const STATUS_TEXT: Record<GoalStatus, string> = {
  done: "Reached",
  on_track: "On track",
  behind: "Behind pace",
  early: "Just started",
};

type GoalInput = { metric: string; period: string; target: number; currency?: string | null; product?: string | null; note?: string | null };

export function checkGoal(input: GoalInput):
  | { ok: true; goal: Omit<Goal, "id" | "created_at"> }
  | { ok: false; error: string } {
  if (!(input.metric in METRICS)) return { ok: false, error: "Pick what you want to measure." };
  if (!(input.period in PERIODS)) return { ok: false, error: "Pick a week, month or quarter." };
  const metric = input.metric as Metric;
  const money = METRICS[metric].unit === "money";
  if (!Number.isFinite(input.target) || input.target <= 0) return { ok: false, error: "Enter a target above zero." };
  const target = money ? Math.round(input.target * 100) : Math.round(input.target);
  if (target < 1 || target >= 1e13) return { ok: false, error: "That target is too big. Enter a smaller number." };
  const currency = money ? (input.currency ?? "").toUpperCase() : null;
  if (money && !/^[A-Z]{3}$/.test(currency ?? "")) return { ok: false, error: "Pick the currency for a revenue goal." };
  const note = (input.note ?? "").trim();
  if (note.length > 200) return { ok: false, error: "Keep the note under 200 characters." };
  return { ok: true, goal: { metric, period: input.period as Period, target, currency, product: input.product || null, note: note || null } };
}
