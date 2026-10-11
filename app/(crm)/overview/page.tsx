import type { Metadata } from "next";
import Figures from "@/components/sales/figures";
import PageShell from "@/components/sales/page-shell";
import PeriodForm from "@/components/sales/period-form";
import ProductStatus from "@/components/sales/product-status";
import { overviewFigures } from "@/lib/crm/overview";
import { PAYMENT_CAP, loadSales, periodFrom } from "@/lib/crm/sales-query";
import { type SearchParams, one, pickFilters } from "@/lib/crm/sales-params";

export const metadata: Metadata = { title: "Overview · Sales CRM", robots: { index: false } };

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await loadSales();
  const { currency, currencies, product, productNames } = pickFilters(params, data);
  const { from, to, label, key } = periodFrom({ period: one(params.period) });
  const figures = overviewFigures({ ...data, from, to, now: new Date(), currency, product });
  const scope = product ? productNames[product] : "All products";

  return (
    <PageShell
      title="Overview"
      intro={`${scope}, ${label.toLowerCase()}, in ${currency}. Amounts in other currencies are kept apart, never added in.`}
    >
      <PeriodForm period={key} product={product ?? ""} currency={currency} products={data.products} currencies={currencies} />
      <section aria-labelledby="sales-heading" className="flex flex-col gap-5">
        <h2 id="sales-heading">Sales</h2>
        <Figures figures={figures} currency={currency} />
        {data.payments.length >= PAYMENT_CAP && (
          <p className="caption-style text-subtle">Figures use the latest {PAYMENT_CAP.toLocaleString()} payments.</p>
        )}
      </section>
      <section aria-labelledby="sources-heading" className="flex flex-col gap-3">
        <h2 id="sources-heading">Apps sending data</h2>
        <ProductStatus products={data.products} lastEvent={data.lastEvent} />
      </section>
    </PageShell>
  );
}
