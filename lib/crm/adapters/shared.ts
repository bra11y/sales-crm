import type { CrmEvent, SubscriptionData, SubscriptionStatus } from "../events.ts";
import type { CompanyMutation, Mutation } from "../mutations.ts";
import { annualisedMinor, formatMoney } from "../money.ts";

export type Adapter = (event: CrmEvent) => Mutation[];

export type ProductRules = {
  stageFor: (event: CrmEvent) => string | undefined;
  segmentFor: (event: CrmEvent) => string | undefined;
  probability: Record<string, number>;
  leadSummary: string;
};

export function dealStatusFor(status: SubscriptionStatus): "open" | "won" | "lost" {
  if (status === "active") return "won";
  if (status === "cancelled") return "lost";
  return "open";
}

function summaryFor(event: CrmEvent, rules: ProductRules): string {
  const { payment, subscription } = event.data;
  if (event.type === "payment.succeeded" && payment) return `Paid ${formatMoney(payment.amount_minor, payment.currency)}`;
  if (event.type === "payment.failed" && payment) return `Payment failed: ${formatMoney(payment.amount_minor, payment.currency)}`;
  if (event.type === "lead.captured") return rules.leadSummary;
  if (event.type === "subscription.changed" && subscription) {
    return `Plan ${subscription.plan} is now ${subscription.status.replace("_", " ")}`;
  }
  return "Signed up";
}

function subscriptionValue(s: SubscriptionData | undefined): number | undefined {
  if (!s) return undefined;
  return s.status === "cancelled" ? 0 : annualisedMinor(s.amount_minor, s.interval_months);
}

export function buildMutations(event: CrmEvent, rules: ProductRules): Mutation[] {
  const { account, contact, subscription, payment } = event.data;
  const externalId = account.id;
  const stage = rules.stageFor(event);

  const company: CompanyMutation = { kind: "company", externalId, name: account.name, sourceAt: event.occurred_at };
  if (stage !== undefined) {
    company.stage = stage;
    company.winProbability = rules.probability[stage] ?? 0;
  }
  const segment = rules.segmentFor(event);
  if (segment !== undefined) company.segment = segment;
  const value = subscriptionValue(subscription);
  if (value !== undefined && subscription) {
    company.pipelineValueMinor = value;
    company.currency = subscription.currency;
  }

  const out: Mutation[] = [company];

  if (contact) out.push({ kind: "contact", externalId, name: contact.name, email: contact.email, phone: contact.phone });

  if (subscription) {
    out.push({
      kind: "subscription",
      externalId,
      plan: subscription.plan,
      status: subscription.status,
      amountMinor: subscription.amount_minor,
      currency: subscription.currency,
      intervalMonths: subscription.interval_months,
      startedAt: subscription.started_at ?? null,
      renewsAt: subscription.renews_at ?? null,
      cancelledAt: subscription.cancelled_at ?? null,
      sourceAt: event.occurred_at,
    });
    out.push({
      kind: "deal",
      externalId,
      stage: stage ?? subscription.status,
      valueMinor: value ?? 0,
      currency: subscription.currency,
      status: dealStatusFor(subscription.status),
    });
  }

  if (payment) {
    out.push({
      kind: "payment",
      externalId,
      reference: payment.reference,
      amountMinor: payment.amount_minor,
      currency: payment.currency,
      provider: payment.provider,
      status: event.type === "payment.failed" ? "failed" : "succeeded",
      paidAt: payment.paid_at,
    });
  }

  out.push({ kind: "activity", externalId, activityKind: event.type, summary: summaryFor(event, rules), at: event.occurred_at });
  return out;
}
