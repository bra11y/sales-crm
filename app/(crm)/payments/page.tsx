import type { Metadata } from "next";
import PageShell from "@/components/sales/page-shell";
import PaymentsTable from "@/components/sales/payments-table";
import PeriodForm from "@/components/sales/period-form";
import BarChart from "@/components/workspace/bar-chart";
import CsvButton from "@/components/workspace/csv-button";
import { Stats } from "@/components/workspace/parts";
import { monthlySeries } from "@/lib/crm/forecast";
import { historyCsv } from "@/lib/crm/history";
import { formatMoney } from "@/lib/crm/money";
import { PAYMENT_CAP, loadSales, periodFrom } from "@/lib/crm/sales-query";
import { type SearchParams, one, pickFilters } from "@/lib/crm/sales-params";

export const metadata: Metadata = { title: "Payments · Sales CRM", robots: { index: false } };

const STATUS_OPTIONS = [
  { value: "succeeded", label: "Paid" },
  { value: "failed", label: "Failed" },
];

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await loadSales();
  const { currency, currencies, product, productNames, status } = pickFilters(params, data);
  const { from, to, label, key } = periodFrom({ period: one(params.period) });
  const rows = data.payments.filter((p) => {
    const t = Date.parse(p.paid_at);
    return (
      p.currency === currency &&
      (!product || p.product === product) &&
      (!status || p.status === status) &&
      t >= from.getTime() &&
      t < to.getTime()
    );
  });

  const paid = rows.filter((p) => p.status === "succeeded");
  const failed = rows.filter((p) => p.status === "failed");
  const total = paid.reduce((s, p) => s + p.amount_minor, 0);
  const byCompany = new Map<string, { name: string; minor: number }>();
  for (const p of paid) {
    const c = byCompany.get(p.company_id) ?? { name: p.company_name, minor: 0 };
    c.minor += p.amount_minor;
    byCompany.set(p.company_id, c);
  }
  const top = [...byCompany.values()].sort((a, b) => b.minor - a.minor)[0];
  const money = (m: number) => formatMoney(m, currency);
  const months = monthlySeries(
    data.payments.filter((p) => !product || p.product === product),
    currency,
    new Date(),
  );
  const csv = historyCsv(
    rows.map((p, i) => ({
      id: String(i),
      at: p.paid_at,
      kind: "money" as const,
      title: `${p.status === "succeeded" ? "Paid" : "Failed"} ${money(p.amount_minor)}`,
      detail: `${p.provider} ref ${p.reference}`,
      companyName: p.company_name,
      amountMinor: p.amount_minor,
      currency: p.currency,
      failed: p.status !== "succeeded",
    })),
  );

  return (
    <PageShell title="Payments" intro={`Your transaction history from all your apps, ${label.toLowerCase()}, newest first. Click a company to see its full record.`}>
      <PeriodForm period={key} product={product ?? ""} currency={currency} products={data.products} currencies={currencies} statusOptions={STATUS_OPTIONS} status={status} />
      <Stats
        label="Payment totals for these filters"
        stats={[
          { label: "Collected", value: money(total), sub: `${paid.length} paid ${paid.length === 1 ? "payment" : "payments"}` },
          { label: "Failed", value: String(failed.length), sub: failed.length ? `${money(failed.reduce((s, p) => s + p.amount_minor, 0))} not collected` : "None failed", tone: failed.length ? "bad" : "good" },
          { label: "Average payment", value: paid.length ? money(Math.round(total / paid.length)) : "—" },
          { label: "Top customer", value: top ? money(top.minor) : "—", sub: top?.name },
        ]}
      />
      <section aria-label="Money in by month" className="rounded-2xl bg-white/[0.04] p-4">
        <BarChart
          title={`Money in, last 12 months (${currency})`}
          currency={currency}
          bars={months.map((m) => ({ key: m.key, label: m.label, value: m.paidMinor, note: `${m.count} paid${m.failedMinor ? `, ${money(m.failedMinor)} failed` : ""}` }))}
        />
      </section>
      <section aria-labelledby="payments-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="payments-heading">
            {rows.length} payment{rows.length === 1 ? "" : "s"}
          </h2>
          {rows.length > 0 && <CsvButton csv={csv} name={`payments-${currency}-${key}.csv`} />}
        </div>
        {data.payments.length >= PAYMENT_CAP && (
          <p className="caption-style text-subtle">Showing the latest {PAYMENT_CAP.toLocaleString()} payments.</p>
        )}
        {rows.length > 0 ? <PaymentsTable rows={rows} productNames={productNames} /> : <p className="text-subtle">No payments match these filters.</p>}
      </section>
    </PageShell>
  );
}
