import type { CrmEvent } from "../events.ts";
import { type Adapter, buildMutations } from "./shared.ts";

function bihubStage(event: CrmEvent): string | undefined {
  if (event.type === "payment.failed") return undefined;
  const s = event.data.subscription;
  if (s?.status === "cancelled") return "Cancelled";
  if (s?.status === "active" || event.type === "payment.succeeded") return "Pro";
  if (event.type === "account.created") return "Store created";
  return undefined;
}

function bihubSegment(event: CrmEvent): string | undefined {
  if (event.type === "payment.failed") return undefined;
  if (event.data.subscription?.status === "active" || event.type === "payment.succeeded") return "Pro";
  if (event.type === "account.created") return "Free";
  return undefined;
}

export const adaptBihub: Adapter = (event) =>
  buildMutations(event, {
    stageFor: bihubStage,
    segmentFor: bihubSegment,
    probability: { "Store created": 30, Pro: 100, Cancelled: 0 },
    leadSummary: "Joined the waitlist",
  });
