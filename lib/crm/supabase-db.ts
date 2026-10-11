import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmDb } from "./apply.ts";
import type { SubscriptionMutation } from "./mutations.ts";

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export function supabaseCrmDb(db: SupabaseClient): CrmDb {
  async function upsertSubscription(
    workspaceId: number,
    companyId: string,
    product: string,
    m: SubscriptionMutation,
    attempt = 0,
  ): Promise<string | null> {
    const { data: existing, error: readError } = await db
      .from("subscriptions")
      .select("id, source_at")
      .eq("company_id", companyId)
      .eq("product", product)
      .maybeSingle();
    fail("read subscription", readError);
    if (existing && Date.parse(existing.source_at) > Date.parse(m.sourceAt)) return null;

    const row = {
      workspace_id: workspaceId,
      company_id: companyId,
      product,
      plan: m.plan,
      status: m.status,
      amount_minor: m.amountMinor,
      currency: m.currency,
      interval_months: m.intervalMonths,
      started_at: m.startedAt,
      renews_at: m.renewsAt,
      cancelled_at: m.cancelledAt,
      source_at: m.sourceAt,
      updated_at: new Date().toISOString(),
    };
    const query = existing
      ? db.from("subscriptions").update(row).eq("id", existing.id).lte("source_at", m.sourceAt)
      : db.from("subscriptions").insert(row);
    const { data, error } = await query.select("id");
    if (error?.code === "23505" && attempt === 0) return upsertSubscription(workspaceId, companyId, product, m, 1);
    fail("write subscription", error);
    return data && data.length > 0 ? (data[0].id as string) : null;
  }

  return {
    async insertEvent(event, workspaceId) {
      const { data, error } = await db
        .from("events")
        .upsert(
          {
            workspace_id: workspaceId,
            product: event.product,
            event_id: event.event_id,
            type: event.type,
            occurred_at: event.occurred_at,
            payload: event,
          },
          { onConflict: "event_id", ignoreDuplicates: true },
        )
        .select("id");
      fail("insert event", error);
      return data && data.length > 0 ? { id: data[0].id as number } : null;
    },

    async setEventStatus(id, status, message) {
      const { error } = await db.from("events").update({ status, error: message }).eq("id", id);
      fail("event status", error);
    },

    async upsertCompany(workspaceId, product, m) {
      const row: Record<string, unknown> = {
        workspace_id: workspaceId,
        product,
        external_id: m.externalId,
        name: m.name,
        updated_at: new Date().toISOString(),
      };
      if (m.stage !== undefined) row.stage = m.stage;
      if (m.segment !== undefined) row.segment = m.segment;
      if (m.winProbability !== undefined) row.win_probability = m.winProbability;
      if (m.pipelineValueMinor !== undefined) row.pipeline_value_minor = m.pipelineValueMinor;
      if (m.currency !== undefined) row.currency = m.currency;
      const { data, error } = await db
        .from("companies")
        .upsert(row, { onConflict: "workspace_id,product,external_id" })
        .select("id")
        .single();
      fail("upsert company", error);
      return data!.id as string;
    },

    async upsertContact(workspaceId, companyId, m) {
      const { error } = await db
        .from("contacts")
        .upsert(
          { workspace_id: workspaceId, company_id: companyId, name: m.name, email: m.email ?? null, phone: m.phone ?? null },
          { onConflict: "company_id,name" },
        );
      fail("upsert contact", error);
    },

    upsertSubscription,

    async upsertDeal(workspaceId, companyId, m) {
      const { error } = await db.from("deals").upsert(
        {
          workspace_id: workspaceId,
          company_id: companyId,
          stage: m.stage,
          value_minor: m.valueMinor,
          currency: m.currency,
          status: m.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );
      fail("upsert deal", error);
    },

    async upsertPayment(workspaceId, companyId, subscriptionId, m) {
      const { error } = await db.from("payments").upsert(
        {
          workspace_id: workspaceId,
          company_id: companyId,
          subscription_id: subscriptionId,
          amount_minor: m.amountMinor,
          currency: m.currency,
          provider: m.provider,
          reference: m.reference,
          status: m.status,
          paid_at: m.paidAt,
        },
        { onConflict: "provider,reference" },
      );
      fail("upsert payment", error);
    },

    async insertActivity(workspaceId, companyId, eventId, m) {
      const { error } = await db.from("activities").upsert(
        { workspace_id: workspaceId, company_id: companyId, event_id: eventId, kind: m.activityKind, summary: m.summary, at: m.at },
        { onConflict: "event_id", ignoreDuplicates: true },
      );
      fail("insert activity", error);
    },
  };
}
