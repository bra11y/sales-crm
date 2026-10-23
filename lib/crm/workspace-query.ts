import "server-only";
import type { ProductProfile } from "@/data/companies";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Goal, Metric, Sample } from "./goals";
import { type HistoryItem, kindOf } from "./history";
import { formatMoney } from "./money";
import type { SalesPayment } from "./sales-query";
import type { CompanyListRow } from "./to-company";

type Named = { name: string; product: string } | null;

export async function loadBoard() {
  const supabase = await createSupabaseServerClient();
  const [rows, products] = await Promise.all([
    supabase.from("company_list").select("*").eq("workspace_id", 1),
    supabase.from("products").select("slug, name, stages, segments, tag_tones").order("name"),
  ]);
  if (rows.error) throw new Error("The pipeline could not be loaded.");
  return { rows: (rows.data ?? []) as CompanyListRow[], products: (products.data ?? []) as ProductProfile[] };
}

type ActivityRow = { id: number; kind: string; summary: string; at: string; company_id: string; companies: Named };

const OUT_KIND: Record<string, string> = { application: "Application", follow_up_1: "Follow-up 1", follow_up_2: "Follow-up 2" };

// Everything that happened, newest first. Payments come from the payments table
// (so failed ones and references show); payment activities are skipped to avoid doubles.
export async function loadHistory(payments: SalesPayment[], userId: string | null, limit = 600): Promise<HistoryItem[]> {
  const supabase = await createSupabaseServerClient();
  const [acts, out, replies] = await Promise.all([
    supabase.from("activities").select("id, kind, summary, at, company_id, companies(name, product)").eq("workspace_id", 1).not("kind", "like", "payment.%").order("at", { ascending: false }).limit(limit),
    userId
      ? supabase.from("applications_outbox").select("id, kind, to_email, sent_at, job_posts(title, company)").eq("user_id", userId).eq("status", "sent").neq("kind", "test").order("sent_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
    userId
      ? supabase.from("application_replies").select("id, from_email, subject, received_at, job_posts(title, company)").eq("user_id", userId).order("received_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  const items: HistoryItem[] = payments.map((p, i) => ({
    id: `pay-${p.reference}-${i}`,
    at: p.paid_at,
    kind: "money",
    title: p.status === "succeeded" ? `Paid ${formatMoney(p.amount_minor, p.currency)}` : `Payment failed: ${formatMoney(p.amount_minor, p.currency)}`,
    detail: `${p.provider} · ref ${p.reference}`,
    companyId: p.company_id,
    companyName: p.company_name,
    product: p.product,
    amountMinor: p.amount_minor,
    currency: p.currency,
    failed: p.status !== "succeeded",
  }));

  for (const a of (acts.data ?? []) as unknown as ActivityRow[]) {
    items.push({ id: `act-${a.id}`, at: a.at, kind: kindOf(a.kind), title: a.summary, companyId: a.company_id, companyName: a.companies?.name, product: a.companies?.product });
  }
  type Job = { title: string; company: string } | null;
  for (const o of (out.data ?? []) as unknown as { id: string; kind: string; to_email: string; sent_at: string; job_posts: Job }[]) {
    items.push({ id: `out-${o.id}`, at: o.sent_at, kind: "email", title: `${OUT_KIND[o.kind] ?? "Email"} sent to ${o.to_email}`, detail: o.job_posts ? `${o.job_posts.title} at ${o.job_posts.company}` : undefined, companyName: o.job_posts?.company, product: "applications" });
  }
  for (const r of (replies.data ?? []) as unknown as { id: string; from_email: string; subject: string; received_at: string; job_posts: Job }[]) {
    items.push({ id: `rep-${r.id}`, at: r.received_at, kind: "email", title: `Reply from ${r.from_email}`, detail: r.subject || undefined, companyName: r.job_posts?.company, product: "applications" });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

const SINCE_DAYS = 550; // six quarters of history for the goal charts

export async function loadGoals(userId: string | null, payments: SalesPayment[]): Promise<{ goals: Goal[]; samples: Record<Metric, Sample[]>; error: boolean }> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - SINCE_DAYS * 86_400_000).toISOString();
  const [goals, acts, replies] = await Promise.all([
    supabase.from("goals").select("id, metric, period, target, currency, product, note, created_at").order("created_at"),
    supabase.from("activities").select("kind, summary, at, companies(product)").eq("workspace_id", 1).in("kind", ["application.sent", "stage.changed", "note"]).gte("at", since).limit(5000),
    userId ? supabase.from("application_replies").select("received_at").eq("user_id", userId).gte("received_at", since) : Promise.resolve({ data: [] }),
  ]);

  const paid = payments.filter((p) => p.status === "succeeded");
  const first = new Map<string, SalesPayment>();
  for (const p of paid) {
    const seen = first.get(p.company_id);
    if (!seen || p.paid_at < seen.paid_at) first.set(p.company_id, p);
  }
  const rows = (acts.data ?? []) as unknown as { kind: string; summary: string; at: string; companies: { product: string } | null }[];
  const samples: Record<Metric, Sample[]> = {
    revenue: paid.map((p) => ({ at: p.paid_at, value: p.amount_minor, currency: p.currency, product: p.product })),
    new_paid: [...first.values()].map((p) => ({ at: p.paid_at, value: 1, currency: p.currency, product: p.product })),
    applications: rows.filter((a) => a.kind === "application.sent").map((a) => ({ at: a.at, value: 1, product: "applications" })),
    interviews: rows.filter((a) => a.kind === "stage.changed" && a.summary.startsWith("Moved to Interview")).map((a) => ({ at: a.at, value: 1, product: "applications" })),
    replies: ((replies.data ?? []) as { received_at: string }[]).map((r) => ({ at: r.received_at, value: 1, product: "applications" })),
    touches: rows.filter((a) => a.kind === "note").map((a) => ({ at: a.at, value: 1, product: a.companies?.product })),
  };
  return { goals: (goals.data ?? []) as Goal[], samples, error: Boolean(goals.error) };
}
