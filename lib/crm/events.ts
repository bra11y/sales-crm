export const EVENT_TYPES = [
  "account.created",
  "lead.captured",
  "subscription.changed",
  "payment.succeeded",
  "payment.failed",
] as const;

export type CrmEventType = (typeof EVENT_TYPES)[number];
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";

export type AccountData = { id: string; name: string; city?: string };
export type ContactData = { name: string; email?: string; phone?: string };
export type SubscriptionData = {
  plan: string;
  status: SubscriptionStatus;
  amount_minor: number;
  currency: string;
  interval_months: 1 | 3 | 6 | 12;
  started_at?: string;
  renews_at?: string;
  cancelled_at?: string;
};
export type PaymentData = {
  reference: string;
  amount_minor: number;
  currency: string;
  provider: string;
  paid_at: string;
};
export type EventData = {
  account: AccountData;
  contact?: ContactData;
  subscription?: SubscriptionData;
  payment?: PaymentData;
  note?: string;
  segment?: string;
};
export type CrmEvent = {
  event_id: string;
  product: string;
  type: CrmEventType;
  occurred_at: string;
  data: EventData;
};

type Result = { ok: true; event: CrmEvent } | { ok: false; reason: string };

const STATUSES = ["trialing", "active", "past_due", "cancelled"];
const INTERVALS = [1, 3, 6, 12];

function isText(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function checkSubscription(s: Record<string, unknown>): string | null {
  if (!isText(s.plan, 80)) return "data.subscription.plan is missing.";
  if (!STATUSES.includes(s.status as string)) return "data.subscription.status is not a known status.";
  if (!isMinor(s.amount_minor)) return "data.subscription.amount_minor must be a whole number of minor units.";
  if (!isCurrency(s.currency)) return "data.subscription.currency must be a three-letter code.";
  if (!INTERVALS.includes(s.interval_months as number)) return "data.subscription.interval_months must be 1, 3, 6 or 12.";
  for (const key of ["started_at", "renews_at", "cancelled_at"]) {
    if (s[key] !== undefined && s[key] !== null && !isDate(s[key])) return `data.subscription.${key} is not a date.`;
  }
  return null;
}

function checkPayment(p: Record<string, unknown>): string | null {
  if (!isText(p.reference, 120)) return "data.payment.reference is missing.";
  if (!isMinor(p.amount_minor)) return "data.payment.amount_minor must be a whole number of minor units.";
  if (!isCurrency(p.currency)) return "data.payment.currency must be a three-letter code.";
  if (!isText(p.provider, 40)) return "data.payment.provider is missing.";
  if (!isDate(p.paid_at)) return "data.payment.paid_at is not a date.";
  return null;
}

export function parseEvent(raw: string): Result {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "The body is not valid JSON." };
  }
  if (!value || typeof value !== "object") return { ok: false, reason: "The body must be an object." };
  const e = value as Record<string, unknown>;

  if (!isText(e.product, 40) || !/^[a-z0-9-]+$/.test(e.product)) return { ok: false, reason: "product is missing." };
  if (!isText(e.event_id, 200) || !e.event_id.startsWith(`${e.product}:`)) {
    return { ok: false, reason: "event_id must start with the product, like washcare:..." };
  }
  if (!EVENT_TYPES.includes(e.type as CrmEventType)) return { ok: false, reason: `Unknown event type: ${String(e.type)}.` };
  if (!isDate(e.occurred_at)) return { ok: false, reason: "occurred_at is not a date." };

  const data = e.data as Record<string, unknown> | undefined;
  const account = data?.account as Record<string, unknown> | undefined;
  if (!account || !isText(account.id, 120) || !isText(account.name, 200)) {
    return { ok: false, reason: "data.account needs an id and a name." };
  }

  const contact = data?.contact as Record<string, unknown> | undefined;
  if (contact !== undefined && !isText(contact.name, 200)) return { ok: false, reason: "data.contact needs a name." };

  if (data?.subscription !== undefined) {
    const problem = checkSubscription(data.subscription as Record<string, unknown>);
    if (problem) return { ok: false, reason: problem };
  }
  if (e.type === "subscription.changed" && data?.subscription === undefined) {
    return { ok: false, reason: "A subscription event needs data.subscription." };
  }

  if (e.type === "payment.succeeded" || e.type === "payment.failed") {
    if (data?.payment === undefined) return { ok: false, reason: "A payment event needs data.payment." };
    const problem = checkPayment(data.payment as Record<string, unknown>);
    if (problem) return { ok: false, reason: problem };
  }

  return { ok: true, event: value as CrmEvent };
}
