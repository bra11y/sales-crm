import { monthlyMinor } from "./money.ts";

export type SubscriptionRow = {
  company_id: string;
  product: string;
  plan: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
  amount_minor: number;
  currency: string;
  interval_months: number;
  renews_at: string | null;
  cancelled_at: string | null;
};

export type PaymentRow = {
  company_id: string;
  product: string;
  amount_minor: number;
  currency: string;
  status: "succeeded" | "failed";
  paid_at: string;
};

export type EffectiveStatus = "Trial" | "Trial ended" | "Active" | "Past due" | "Cancelled";

export type OverviewFigures = {
  revenueMinor: number;
  newPaidAccounts: number;
  mrrMinor: number;
  activeSubscriptions: number;
  trialsEndingSoon: number;
  trialsEnded: number;
  failedPayments: number;
  cancellations: number;
};

const WEEK = 7 * 86_400_000;

export function effectiveStatus(s: SubscriptionRow, now: Date): EffectiveStatus {
  if (s.status === "cancelled") return "Cancelled";
  if (s.status === "past_due") return "Past due";
  if (s.status === "active") return "Active";
  return s.renews_at && Date.parse(s.renews_at) <= now.getTime() ? "Trial ended" : "Trial";
}

function within(iso: string | null, from: Date, to: Date) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= from.getTime() && t < to.getTime();
}

export function overviewFigures(input: {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  from: Date;
  to: Date;
  now: Date;
  currency: string;
  product?: string;
}): OverviewFigures {
  const { from, to, now, currency, product } = input;
  const subs = input.subscriptions.filter((s) => s.currency === currency && (!product || s.product === product));
  const pays = input.payments.filter((p) => p.currency === currency && (!product || p.product === product));
  const succeeded = pays.filter((p) => p.status === "succeeded");

  const firstPaid = new Map<string, number>();
  for (const p of succeeded) {
    const t = Date.parse(p.paid_at);
    const seen = firstPaid.get(p.company_id);
    if (seen === undefined || t < seen) firstPaid.set(p.company_id, t);
  }

  const active = subs.filter((s) => s.status === "active");
  const trials = subs.filter((s) => s.status === "trialing");

  return {
    revenueMinor: succeeded.filter((p) => within(p.paid_at, from, to)).reduce((sum, p) => sum + p.amount_minor, 0),
    newPaidAccounts: [...firstPaid.values()].filter((t) => t >= from.getTime() && t < to.getTime()).length,
    mrrMinor: active.reduce((sum, s) => sum + monthlyMinor(s.amount_minor, s.interval_months), 0),
    activeSubscriptions: active.length,
    trialsEndingSoon: trials.filter((s) => {
      if (!s.renews_at) return false;
      const t = Date.parse(s.renews_at);
      return t > now.getTime() && t <= now.getTime() + WEEK;
    }).length,
    trialsEnded: trials.filter((s) => effectiveStatus(s, now) === "Trial ended").length,
    failedPayments: pays.filter((p) => p.status === "failed" && within(p.paid_at, from, to)).length,
    cancellations: subs.filter((s) => s.status === "cancelled" && within(s.cancelled_at, from, to)).length,
  };
}

export function currenciesIn(subscriptions: SubscriptionRow[], payments: PaymentRow[]): string[] {
  const set = new Set([...subscriptions.map((s) => s.currency), ...payments.map((p) => p.currency)]);
  return [...set].sort((a, b) => (a === "NGN" ? -1 : b === "NGN" ? 1 : a.localeCompare(b)));
}
