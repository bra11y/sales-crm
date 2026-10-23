import type { Metadata } from "next";
import Figures from "@/components/sales/figures";
import PageShell from "@/components/sales/page-shell";
import PeriodForm from "@/components/sales/period-form";
import ProductStatus from "@/components/sales/product-status";
import Link from "next/link";
import { GoalCard } from "@/components/workspace/goals";
import { goalViews } from "@/lib/crm/goal-views";
import { overviewFigures } from "@/lib/crm/overview";
import { PAYMENT_CAP, loadSales, periodFrom } from "@/lib/crm/sales-query";
import { type SearchParams, one, pickFilters } from "@/lib/crm/sales-params";

export const metadata: Metadata = { title: "Overview · Sales CRM", robots: { index: false } };

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [data, goals] = await Promise.all([loadSales(), goalViews()]);
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
      <section aria-labelledby="goals-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="goals-heading">Goals</h2>
          <Link href="/goals" className="text-soft hover:text-foreground underline underline-offset-2">
            {goals.views.length ? "See all goals" : "Set your first goal"}
          </Link>
        </div>
        {goals.views.length ? (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {goals.views.slice(0, 4).map((v) => (
              <GoalCard key={v.goal.id} view={v} compact productName={v.goal.product ? data.products.find((p) => p.slug === v.goal.product)?.name : undefined} />
            ))}
          </ul>
        ) : (
          <p className="text-subtle">No goals yet. A goal counts itself and tells you if you are on pace.</p>
        )}
      </section>
      <section aria-labelledby="sources-heading" className="flex flex-col gap-3">
        <h2 id="sources-heading">Apps sending data</h2>
        <ProductStatus products={data.products} lastEvent={data.lastEvent} />
      </section>
    </PageShell>
  );
}
