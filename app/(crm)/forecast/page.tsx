import type { Metadata } from "next";
import Link from "next/link";
import Button from "@/components/_ui/button";
import BarChart from "@/components/workspace/bar-chart";
import { Group, LINK, Page, PageHead, Stats, ViewTabs } from "@/components/workspace/parts";
import { monthlySeries, projectNext, renewalsDue, weightedPipeline } from "@/lib/crm/forecast";
import { formatMoney } from "@/lib/crm/money";
import { currenciesIn } from "@/lib/crm/overview";
import { loadSales } from "@/lib/crm/sales-query";
import { type SearchParams, one } from "@/lib/crm/sales-params";
import { loadBoard } from "@/lib/crm/workspace-query";

export const metadata: Metadata = { title: "Forecast · Sales CRM", robots: { index: false } };

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function ForecastPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [sales, board] = await Promise.all([loadSales(), loadBoard()]);
  const pipelineCurrencies = board.rows.map((r) => r.currency);
  const currencies = [...new Set([...currenciesIn(sales.subscriptions, sales.payments), ...pipelineCurrencies])];
  if (!currencies.length) currencies.push("NGN");
  const currency = currencies.includes(one(params.currency) ?? "") ? one(params.currency)! : currencies[0];
  const now = new Date();
  const money = (m: number) => formatMoney(m, currency);

  const past = monthlySeries(sales.payments, currency, now, 9);
  const next = projectNext(sales.subscriptions, currency, now, 3);
  const pipeline = weightedPipeline(
    board.rows.map((r) => ({ product: r.product, stage: r.stage ?? "No stage", valueMinor: r.pipeline_value_minor, currency: r.currency, winProbability: r.win_probability })),
    currency,
    Object.fromEntries(board.products.map((p) => [p.slug, p.stages])),
  );
  const renewals = renewalsDue(sales.subscriptions, currency, now, 30);
  const names = Object.fromEntries(board.products.map((p) => [p.slug, p.name]));
  const thisMonth = past.at(-1)!;
  const lastMonth = past.at(-2)!;
  const change = lastMonth.paidMinor ? Math.round(((thisMonth.paidMinor - lastMonth.paidMinor) / lastMonth.paidMinor) * 100) : null;

  return (
    <Page>
      <PageHead
        title="Forecast"
        intro={`What is coming in, in ${currency}. Recurring revenue is what active plans bring each month. Expected revenue adds trials, at the rate trials have turned into paying customers so far.`}
        actions={
          <Button variant="secondary" size="md" className="h-11 px-4" href="/goals">
            Set a goal
          </Button>
        }
        views={
          currencies.length > 1 ? <ViewTabs label="Currency" current={`/forecast?currency=${currency}`} views={currencies.map((c) => ({ href: `/forecast?currency=${c}`, label: c }))} /> : undefined
        }
      />
      <Stats
        label="Forecast figures"
        stats={[
          { label: "Monthly recurring revenue", value: money(next.mrrMinor), sub: `${money(next.mrrMinor * 12)} a year at this rate` },
          { label: "Expected next month", value: money(next.months[0].minor), sub: next.trialMinor ? `Includes ${money(next.trialMinor)} from trials` : "No trials expected to convert yet" },
          {
            label: "Collected this month",
            value: money(thisMonth.paidMinor),
            sub: change === null ? `${thisMonth.count} payments` : change === 0 ? `Same as ${lastMonth.label}` : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}% on ${lastMonth.label}`,
            tone: !change ? undefined : change > 0 ? "good" : "bad",
          },
          { label: "Weighted pipeline", value: money(pipeline.weightedMinor), sub: `Of ${money(pipeline.valueMinor)} open value` },
        ]}
      />
      <section aria-label="Revenue by month" className="rounded-2xl bg-white/[0.04] p-4">
        <BarChart
          title={`Money in, by month (${currency})`}
          currency={currency}
          bars={[
            ...past.map((p) => ({ key: p.key, label: p.label, value: p.paidMinor, kind: "actual" as const, note: `${p.count} payment${p.count === 1 ? "" : "s"}` })),
            ...next.months.map((m) => ({ key: m.key, label: m.label, value: m.minor, kind: "projected" as const })),
          ]}
        />
        <p className="text-soft mt-2 text-[13px]">
          Trials have turned into paying customers {next.rate ? `${Math.round(next.rate * 100)}% of the time` : "— no history yet"}. Failed payments are left out. See every payment in{" "}
          <Link href="/payments" className={LINK}>
            Payments
          </Link>
          .
        </p>
      </section>

      <Group title="Renewals and trials ending in the next 30 days" count={renewals.length} empty="Nothing renews or ends in the next 30 days.">
        {renewals.map((r) => (
          <li key={`${r.companyId}-${r.product}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <span>
              <Link href={`/?company=${r.companyId}`} className={`${LINK} font-medium no-underline hover:underline`}>
                {r.companyName}
              </Link>
              <span className="text-soft">
                {" "}
                · {names[r.product] ?? r.product} · {r.plan}
              </span>
            </span>
            <span className="text-[14px] tabular-nums">
              {money(r.amountMinor)}{" "}
              <span className="text-soft">
                {r.trial ? "trial ends" : "renews"} {date(r.renewsAt)}
              </span>
            </span>
          </li>
        ))}
      </Group>

      <section aria-labelledby="weighted" className="flex flex-col gap-2">
        <h2 id="weighted" className="px-4 text-[17px] font-semibold tracking-[-0.01em]">
          Pipeline by stage
        </h2>
        {pipeline.byStage.length ? (
          <div className="overflow-x-auto rounded-2xl bg-white/[0.04]">
            <table className="w-full min-w-[32em] text-[14px]">
              <caption className="sr-only">Open value and weighted value by pipeline and stage, in {currency}</caption>
              <thead>
                <tr className="text-soft text-left text-[13px]">
                  <th scope="col" className="px-4 py-2.5 font-normal">
                    Pipeline
                  </th>
                  <th scope="col" className="py-2.5 font-normal">
                    Stage
                  </th>
                  <th scope="col" className="py-2.5 text-right font-normal">
                    Companies
                  </th>
                  <th scope="col" className="py-2.5 text-right font-normal">
                    Value
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-normal">
                    Weighted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {pipeline.byStage.map((t) => (
                  <tr key={`${t.product}-${t.stage}`}>
                    <td className="px-4 py-2.5">
                      <Link href={`/deals?product=${t.product}`} className={LINK}>
                        {names[t.product] ?? t.product}
                      </Link>
                    </td>
                    <td className="py-2.5">{t.stage}</td>
                    <td className="py-2.5 text-right tabular-nums">{t.count}</td>
                    <td className="py-2.5 text-right tabular-nums">{money(t.valueMinor)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(t.weightedMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-soft rounded-2xl bg-white/[0.04] px-4 py-3.5 text-[14px]">No open value in {currency} yet.</p>
        )}
      </section>
    </Page>
  );
}
