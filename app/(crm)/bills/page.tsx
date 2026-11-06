import type { Metadata } from "next";
import Bills from "@/components/money/bills";
import { Page, PageHead } from "@/components/workspace/parts";
import type { Bill, Payment } from "@/lib/money/bills";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bills and subscriptions · Sales CRM", robots: { index: false } };

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export default async function BillsPage() {
  const supabase = await createSupabaseServerClient();
  const since = daysAgo(62);
  const [bills, payments, plan] = await Promise.all([
    supabase.from("bills").select("id, name, amount, currency, cycle, next_due, category, method, url, note, status, created_at").order("next_due"),
    supabase.from("bill_payments").select("id, bill_id, paid_on, amount, currency").gte("paid_on", since).order("paid_on", { ascending: false }),
    supabase.from("money_plans").select("income, currency, save_percent, tips").maybeSingle(),
  ]);
  const num = <T extends { amount: unknown }>(r: T) => ({ ...r, amount: Number(r.amount) });
  return (
    <Page>
      <PageHead title="Bills and subscriptions" intro="Every bill and subscription in one place: what is due this month, what you have paid, and what is left of your income to save." />
      {(bills.error || payments.error) && (
        <p role="alert" className="text-danger">
          Your bills could not be loaded. If this is new, the database update may not be live yet.
        </p>
      )}
      <Bills
        bills={(bills.data ?? []).map(num) as Bill[]}
        payments={(payments.data ?? []).map(num) as Payment[]}
        plan={plan.data ? { income: plan.data.income === null ? null : Number(plan.data.income), currency: plan.data.currency, save: plan.data.save_percent, tips: (plan.data.tips as { list: { title: string; detail: string }[]; at: string } | null) ?? null } : null}
        now={new Date().toISOString()}
      />
    </Page>
  );
}
