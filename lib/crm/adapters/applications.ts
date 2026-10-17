import type { Mutation } from "../mutations.ts";
import { APPLICATION_PROBABILITY } from "../application-stage.ts";
import type { Adapter } from "./shared.ts";

const DOC_NAMES: Record<string, string> = { cv: "CV", cover: "cover letter", proposal: "proposal" };

function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
export const adaptApplications: Adapter = (event) => {
  const { account, contact, application, segment } = event.data;
  if (!application) throw new Error("An application event has no application data.");
  const externalId = account.id;
  const valueMinor = application.value_minor ?? 0;
  const currency = application.currency ?? "USD";

  const docs = (["cv", "cover", "proposal"] as const).filter((k) => application.documents[k]).map((k) => DOC_NAMES[k]);
  let summary = `Sent ${list(docs)} for ${application.role}`;
  const n = application.matched.length;
  if (n) summary += ` · ${n} skill${n === 1 ? "" : "s"} matched`;
  if (application.gaps.length) summary += ` · not in my skills: ${application.gaps.join(", ")}`;

  const out: Mutation[] = [
    {
      kind: "company",
      externalId,
      name: account.name,
      stage: "Applied",
      segment: segment ?? "Job",
      winProbability: APPLICATION_PROBABILITY.Applied,
      ...(application.value_minor !== undefined ? { pipelineValueMinor: valueMinor, currency } : {}),
      sourceAt: event.occurred_at,
    },
  ];
  if (contact) out.push({ kind: "contact", externalId, name: contact.name, email: contact.email, phone: contact.phone });
  out.push({ kind: "deal", externalId, stage: "Applied", valueMinor, currency, status: "open" });
  out.push({ kind: "activity", externalId, activityKind: event.type, summary: summary.slice(0, 300), at: event.occurred_at });
  return out;
};
