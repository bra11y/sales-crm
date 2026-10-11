import type { CrmEvent } from "./events.ts";
import type {
  ActivityMutation,
  CompanyMutation,
  ContactMutation,
  DealMutation,
  Mutation,
  PaymentMutation,
  SubscriptionMutation,
} from "./mutations.ts";
import { adapterFor } from "./adapters/index.ts";

export interface CrmDb {
  insertEvent(event: CrmEvent, workspaceId: number): Promise<{ id: number } | null>;
  setEventStatus(id: number, status: "applied" | "failed", error: string | null): Promise<void>;
  upsertCompany(workspaceId: number, product: string, m: CompanyMutation): Promise<string>;
  upsertContact(workspaceId: number, companyId: string, m: ContactMutation): Promise<void>;
  upsertSubscription(workspaceId: number, companyId: string, product: string, m: SubscriptionMutation): Promise<string | null>;
  upsertDeal(workspaceId: number, companyId: string, m: DealMutation): Promise<void>;
  upsertPayment(workspaceId: number, companyId: string, subscriptionId: string | null, m: PaymentMutation): Promise<void>;
  insertActivity(workspaceId: number, companyId: string, eventId: string, m: ActivityMutation): Promise<void>;
}

export type ApplyResult =
  | { status: "applied" }
  | { status: "duplicate" }
  | { status: "failed"; error: string }
  | { status: "unsupported" };

function identityOnly(m: CompanyMutation): CompanyMutation {
  return { kind: "company", externalId: m.externalId, name: m.name };
}

async function run(mutations: Mutation[], event: CrmEvent, db: CrmDb, workspaceId: number) {
  const company = mutations.find((m): m is CompanyMutation => m.kind === "company");
  if (!company) throw new Error("The adapter produced no company.");
  const subscription = mutations.find((m): m is SubscriptionMutation => m.kind === "subscription");

  let subscriptionId: string | null = null;
  let stale = false;
  let companyId = await db.upsertCompany(workspaceId, event.product, identityOnly(company));

  if (subscription) {
    subscriptionId = await db.upsertSubscription(workspaceId, companyId, event.product, subscription);
    stale = subscriptionId === null;
  }
  if (!stale) companyId = await db.upsertCompany(workspaceId, event.product, company);

  for (const m of mutations) {
    if (m.kind === "contact") await db.upsertContact(workspaceId, companyId, m);
    if (m.kind === "deal" && !stale) await db.upsertDeal(workspaceId, companyId, m);
    if (m.kind === "payment") await db.upsertPayment(workspaceId, companyId, subscriptionId, m);
    if (m.kind === "activity") await db.insertActivity(workspaceId, companyId, event.event_id, m);
  }
}

async function applyRow(rowId: number, event: CrmEvent, db: CrmDb, workspaceId: number): Promise<ApplyResult> {
  const adapter = adapterFor(event.product);
  if (!adapter) return { status: "unsupported" };
  try {
    await run(adapter(event), event, db, workspaceId);
    await db.setEventStatus(rowId, "applied", null);
    return { status: "applied" };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await db.setEventStatus(rowId, "failed", error);
    return { status: "failed", error };
  }
}

export async function applyEvent(event: CrmEvent, db: CrmDb, workspaceId = 1): Promise<ApplyResult> {
  if (!adapterFor(event.product)) return { status: "unsupported" };
  const row = await db.insertEvent(event, workspaceId);
  if (!row) return { status: "duplicate" };
  return applyRow(row.id, event, db, workspaceId);
}

export function replayEvent(rowId: number, event: CrmEvent, db: CrmDb, workspaceId = 1): Promise<ApplyResult> {
  return applyRow(rowId, event, db, workspaceId);
}
