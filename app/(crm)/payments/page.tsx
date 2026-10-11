import type { Metadata } from "next";
import PageShell from "@/components/sales/page-shell";
import PaymentsTable from "@/components/sales/payments-table";
import PeriodForm from "@/components/sales/period-form";
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

  return (
    <PageShell title="Payments" intro={`Payments from all your apps, ${label.toLowerCase()}, newest first.`}>
      <PeriodForm period={key} product={product ?? ""} currency={currency} products={data.products} currencies={currencies} statusOptions={STATUS_OPTIONS} status={status} />
      <section aria-labelledby="payments-heading" className="flex flex-col gap-4">
        <h2 id="payments-heading">
          {rows.length} payment{rows.length === 1 ? "" : "s"}
        </h2>
        {data.payments.length >= PAYMENT_CAP && (
          <p className="caption-style text-subtle">Showing the latest {PAYMENT_CAP.toLocaleString()} payments.</p>
        )}
        {rows.length > 0 ? <PaymentsTable rows={rows} productNames={productNames} /> : <p className="text-subtle">No payments match these filters.</p>}
      </section>
    </PageShell>
  );
}
