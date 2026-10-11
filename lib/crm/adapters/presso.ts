import type { CrmEvent } from "../events.ts";
import { type Adapter, buildMutations } from "./shared.ts";

const TERM: Record<number, string> = { 1: "Monthly", 3: "Quarterly", 6: "Biannual", 12: "Yearly" };

const WASHCARE_STAGE: Record<string, string> = {
  trialing: "Trial",
  active: "Paying",
  past_due: "Locked",
  cancelled: "Cancelled",
};

function washcareStage(event: CrmEvent): string | undefined {
  if (event.type === "lead.captured") return "Demo requested";
  if (event.type === "payment.failed") return undefined;
  const status = event.data.subscription?.status;
  if (status) return WASHCARE_STAGE[status];
  if (event.type === "payment.succeeded") return "Paying";
  if (event.type === "account.created") return "Trial";
  return undefined;
}

export const adaptWashcare: Adapter = (event) =>
  buildMutations(event, {
    stageFor: washcareStage,
    segmentFor: (e) => (e.data.subscription ? TERM[e.data.subscription.interval_months] : undefined),
    probability: { "Demo requested": 20, Trial: 40, "Trial ended": 15, Paying: 100, Locked: 15, Cancelled: 0 },
    leadSummary: "Requested a demo",
  });

export const adaptLux: Adapter = (event) =>
  buildMutations(event, {
    stageFor: () => "Client",
    segmentFor: () => "Managed client",
    probability: { Client: 100 },
    leadSummary: "New enquiry",
  });
