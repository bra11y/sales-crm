import type { SubscriptionStatus } from "./events.ts";

export type CompanyMutation = {
  kind: "company";
  externalId: string;
  name: string;
  stage?: string;
  segment?: string;
  winProbability?: number;
  pipelineValueMinor?: number;
  currency?: string;
  sourceAt?: string;
};

export type ContactMutation = { kind: "contact"; externalId: string; name: string; email?: string; phone?: string };

export type SubscriptionMutation = {
  kind: "subscription";
  externalId: string;
  plan: string;
  status: SubscriptionStatus;
  amountMinor: number;
  currency: string;
  intervalMonths: 1 | 3 | 6 | 12;
  startedAt: string | null;
  renewsAt: string | null;
  cancelledAt: string | null;
  sourceAt: string;
};

export type DealMutation = {
  kind: "deal";
  externalId: string;
  stage: string;
  valueMinor: number;
  currency: string;
  status: "open" | "won" | "lost";
};

export type PaymentMutation = {
  kind: "payment";
  externalId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  provider: string;
  status: "succeeded" | "failed";
  paidAt: string;
};

export type ActivityMutation = { kind: "activity"; externalId: string; activityKind: string; summary: string; at: string };

export type Mutation =
  | CompanyMutation
  | ContactMutation
  | SubscriptionMutation
  | DealMutation
  | PaymentMutation
  | ActivityMutation;
