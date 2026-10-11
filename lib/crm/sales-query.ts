import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PaymentRow, SubscriptionRow } from "./overview";

const DAY = 86_400_000;
const PERIODS: Record<string, { label: string; days: number }> = {
  today: { label: "Today", days: 0 },
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
};

export const PAYMENT_CAP = 1000;

export function periodFrom(params: { period?: string }, now = new Date()) {
  const key = params.period && PERIODS[params.period] ? params.period : "30d";
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(startOfToday.getTime() + DAY);
  const from = key === "today" ? startOfToday : new Date(to.getTime() - PERIODS[key].days * DAY);
  return { from, to, label: PERIODS[key].label, key };
}

export const PERIOD_OPTIONS = Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }));

export type SalesSubscription = SubscriptionRow & { company_name: string };
export type SalesPayment = PaymentRow & { company_name: string; reference: string; provider: string };
export type SalesProduct = { slug: string; name: string; host: string | null };

export async function loadSales() {
  const supabase = await createSupabaseServerClient();
  const [subs, pays, products, events] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("company_id, product, plan, status, amount_minor, currency, interval_months, renews_at, cancelled_at, companies(name)")
      .eq("workspace_id", 1),
    supabase
      .from("payments")
      .select("company_id, amount_minor, currency, status, paid_at, reference, provider, companies(name, product)")
      .eq("workspace_id", 1)
      .order("paid_at", { ascending: false })
      .limit(PAYMENT_CAP),
    supabase.from("products").select("slug, name, host").order("name"),
    supabase.from("events").select("product, received_at").order("received_at", { ascending: false }).limit(500),
  ]);
  if (subs.error || pays.error) throw new Error("Sales could not be loaded.");

  const lastEvent: Record<string, string> = {};
  for (const e of events.data ?? []) lastEvent[e.product] ??= e.received_at;

  const subscriptions: SalesSubscription[] = (subs.data ?? []).map((s) => ({
    ...(s as unknown as SubscriptionRow),
    company_name: (s.companies as unknown as { name: string } | null)?.name ?? "Unknown",
  }));
  const payments: SalesPayment[] = (pays.data ?? []).map((p) => {
    const company = p.companies as unknown as { name: string; product: string } | null;
    return {
      ...(p as unknown as PaymentRow),
      product: company?.product ?? "",
      company_name: company?.name ?? "Unknown",
      reference: p.reference as string,
      provider: p.provider as string,
    };
  });

  return { subscriptions, payments, products: (products.data ?? []) as SalesProduct[], lastEvent };
}
