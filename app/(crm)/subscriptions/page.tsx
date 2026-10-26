import type { Metadata } from "next";
import PageShell from "@/components/sales/page-shell";
import PeriodForm from "@/components/sales/period-form";
import SubscriptionsTable from "@/components/sales/subscriptions-table";
import { effectiveStatus } from "@/lib/crm/overview";
import { loadSales } from "@/lib/crm/sales-query";
import { type SearchParams, pickFilters } from "@/lib/crm/sales-params";

export const metadata: Metadata = { title: "Subscriptions · Sales CRM", robots: { index: false } };

const STATUS_OPTIONS = ["Trial", "Trial ended", "Active", "Past due", "Cancelled"].map((s) => ({ value: s, label: s }));

export default async function SubscriptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await loadSales();
  const { currency, currencies, product, productNames, status } = pickFilters(params, data);
  const now = new Date();
  const rows = data.subscriptions
    .filter((s) => s.currency === currency && (!product || s.product === product))
    .filter((s) => !status || effectiveStatus(s, now) === status)
    .sort((a, b) => a.company_name.localeCompare(b.company_name));
  const hosts = data.products.filter((p) => p.host);

  return (
    <PageShell title="Subscriptions" intro="Every plan across your apps, with its status worked out from the latest event and today's date.">
      <PeriodForm product={product ?? ""} currency={currency} products={data.products} currencies={currencies} statusOptions={STATUS_OPTIONS} status={status} />
      <section aria-labelledby="subs-heading" className="flex flex-col gap-4">
        <h2 id="subs-heading">
          {rows.length} subscription{rows.length === 1 ? "" : "s"}
        </h2>
        {rows.length > 0 ? <SubscriptionsTable rows={rows} productNames={productNames} /> : <p className="text-subtle">No subscriptions match these filters.</p>}
      </section>
      <section aria-labelledby="manage-heading" className="flex flex-col gap-2">
        <h2 id="manage-heading">Changing a plan</h2>
        <p className="text-subtle max-w-[40em]">For now, plan changes are made inside each app. Managing them from here comes in the next phase.</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {hosts.map((p) => (
            <li key={p.slug}>
              <a href={`https://${p.host}`} className="focus-visible:ring-ring rounded-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none">
                Open {p.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
