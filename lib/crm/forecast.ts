// Forecast maths: weighted pipeline, monthly revenue, renewals due. Pure.
import { monthlyMinor } from "./money.ts";
import type { PaymentRow, SubscriptionRow } from "./overview.ts";

const DAY = 86_400_000;

export type PipelineCompany = { product: string; stage: string; valueMinor: number; currency: string; winProbability: number };

export type StageTotal = { product: string; stage: string; count: number; valueMinor: number; weightedMinor: number };

export function weightedPipeline(companies: PipelineCompany[], currency: string, stageOrder: Record<string, string[]> = {}) {
  const map = new Map<string, StageTotal>();
  for (const c of companies) {
    if (c.currency !== currency) continue;
    const key = `${c.product}\u0000${c.stage}`;
    const t = map.get(key) ?? { product: c.product, stage: c.stage, count: 0, valueMinor: 0, weightedMinor: 0 };
    t.count++;
    t.valueMinor += c.valueMinor;
    t.weightedMinor += Math.round((c.valueMinor * c.winProbability) / 100);
    map.set(key, t);
  }
  const rank = (t: StageTotal) => {
    const i = stageOrder[t.product]?.indexOf(t.stage) ?? -1;
    return i < 0 ? 99 : i;
  };
  const byStage = [...map.values()].sort((a, b) => a.product.localeCompare(b.product) || rank(a) - rank(b));
  return {
    byStage,
    valueMinor: byStage.reduce((s, t) => s + t.valueMinor, 0),
    weightedMinor: byStage.reduce((s, t) => s + t.weightedMinor, 0),
  };
}

export type MonthPoint = { key: string; label: string; paidMinor: number; failedMinor: number; count: number };

// The last `months` calendar months (UTC), oldest first, including the current one.
export function monthlySeries(payments: PaymentRow[], currency: string, now: Date, months = 12): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let back = months - 1; back >= 0; back--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    points.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), paidMinor: 0, failedMinor: 0, count: 0 });
  }
  const index = new Map(points.map((p, i) => [p.key, i]));
  for (const p of payments) {
    if (p.currency !== currency) continue;
    const i = index.get(p.paid_at.slice(0, 7));
    if (i === undefined) continue;
    if (p.status === "succeeded") {
      points[i].paidMinor += p.amount_minor;
      points[i].count++;
    } else points[i].failedMinor += p.amount_minor;
  }
  return points;
}

export type Renewal = { companyId: string; companyName: string; product: string; plan: string; amountMinor: number; renewsAt: string; trial: boolean };

export function renewalsDue(subs: (SubscriptionRow & { company_name: string })[], currency: string, now: Date, days: number): Renewal[] {
  const end = now.getTime() + days * DAY;
  return subs
    .filter((s) => s.currency === currency && (s.status === "active" || s.status === "trialing") && s.renews_at)
    .filter((s) => {
      const t = Date.parse(s.renews_at!);
      return t > now.getTime() && t <= end;
    })
    .map((s) => ({ companyId: s.company_id, companyName: s.company_name, product: s.product, plan: s.plan, amountMinor: s.amount_minor, renewsAt: s.renews_at!, trial: s.status === "trialing" }))
    .sort((a, b) => a.renewsAt.localeCompare(b.renewsAt));
}

// Share of trials that went on to pay, from what is known so far. null when there is no history yet.
export function trialConversion(subs: SubscriptionRow[], currency: string, now: Date): number | null {
  const relevant = subs.filter((s) => s.currency === currency);
  const converted = relevant.filter((s) => s.status === "active" || s.status === "past_due").length;
  const lapsed = relevant.filter((s) => s.status === "cancelled" || (s.status === "trialing" && s.renews_at && Date.parse(s.renews_at) <= now.getTime())).length;
  return converted + lapsed ? converted / (converted + lapsed) : null;
}

// Next months: recurring revenue that renews, plus trials expected to convert at the known rate.
export function projectNext(subs: SubscriptionRow[], currency: string, now: Date, months = 3) {
  const active = subs.filter((s) => s.currency === currency && s.status === "active");
  const mrr = active.reduce((sum, s) => sum + monthlyMinor(s.amount_minor, s.interval_months), 0);
  const rate = trialConversion(subs, currency, now) ?? 0;
  const trials = subs.filter((s) => s.currency === currency && s.status === "trialing" && s.renews_at && Date.parse(s.renews_at) > now.getTime());
  const fromTrials = Math.round(trials.reduce((sum, s) => sum + monthlyMinor(s.amount_minor, s.interval_months), 0) * rate);
  const out = [];
  for (let ahead = 1; ahead <= months; ahead++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + ahead, 1));
    out.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), minor: mrr + fromTrials });
  }
  return { mrrMinor: mrr, trialMinor: fromTrials, rate, months: out };
}
