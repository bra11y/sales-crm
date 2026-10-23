import type { Metadata } from "next";
import Button from "@/components/_ui/button";
import DealsBoard, { type Card } from "@/components/workspace/deals-board";
import { Page, PageHead, Stats, ViewTabs } from "@/components/workspace/parts";
import { formatMoney } from "@/lib/crm/money";
import { EDITABLE_PRODUCTS, isSlipping, SLIPPING_DAYS } from "@/lib/crm/pipelines";
import { loadBoard } from "@/lib/crm/workspace-query";
import { type SearchParams, one } from "@/lib/crm/sales-params";

export const metadata: Metadata = { title: "Deals board · Sales CRM", robots: { index: false } };

const DAY = 86_400_000;

export default async function DealsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { rows, products } = await loadBoard();
  const now = new Date().getTime();
  const cards: Card[] = rows.map((r) => {
    const days = r.last_interaction_at ? Math.floor((now - Date.parse(r.last_interaction_at)) / DAY) : 9999;
    return {
      id: r.id,
      name: r.name,
      product: r.product,
      stage: r.stage ?? "No stage",
      segment: r.segment,
      valueMinor: r.pipeline_value_minor,
      currency: r.currency,
      win: r.win_probability,
      days,
      lastLabel: r.last_interaction_label,
      slipping: isSlipping({ stage: r.stage, activityDays: days }),
    };
  });

  const view = one(params.view) === "slipping" ? "slipping" : null;
  const withCompanies = products.filter((p) => cards.some((c) => c.product === p.slug));
  const fallback = withCompanies.find((p) => p.slug === "applications") ?? withCompanies[0] ?? products[0];
  const product = products.find((p) => p.slug === one(params.product)) ?? fallback;
  const slipping = cards.filter((c) => c.slipping);
  const shown = view ? slipping : cards.filter((c) => c.product === product?.slug);
  const stages = view ? [...new Set(slipping.map((c) => c.stage))] : [...(product?.stages ?? []), ...new Set(shown.map((c) => c.stage).filter((s) => !product?.stages.includes(s)))];

  const currencies = [...new Set(shown.map((c) => c.currency))];
  const money = (pick: (c: Card) => number) => currencies.map((cur) => formatMoney(shown.filter((c) => c.currency === cur).reduce((s, c) => s + pick(c), 0), cur)).join(" · ") || "—";
  const current = view ? "/deals?view=slipping" : `/deals?product=${product?.slug}`;

  return (
    <Page wide>
      <PageHead
        title="Deals board"
        intro={
          view
            ? `Open companies with nothing logged for ${SLIPPING_DAYS} days or more, across every pipeline. Open one and add a note, or move it on.`
            : EDITABLE_PRODUCTS.includes(product?.slug ?? "")
              ? "Each column is a stage. Use “Move to” on a card to change its stage, or drag the card. Open a card to see its full record."
              : `${product?.name ?? "This pipeline"} sets each stage from its own billing events, so this board is read-only. Open a card to see payments and the timeline.`
        }
        actions={<Button variant="secondary" size="md" className="h-11 px-4" href="/forecast">See the forecast</Button>}
        views={
          <ViewTabs
            label="Pipelines"
            current={current}
            views={[
              ...withCompanies.map((p) => ({ href: `/deals?product=${p.slug}`, label: p.name, count: cards.filter((c) => c.product === p.slug).length })),
              { href: "/deals?view=slipping", label: "Slipping", count: slipping.length },
            ]}
          />
        }
      />
      <Stats
        label="Board totals"
        stats={[
          { label: "Companies", value: String(shown.length) },
          { label: "Pipeline value", value: money((c) => c.valueMinor) },
          { label: "Weighted by win chance", value: money((c) => Math.round((c.valueMinor * c.win) / 100)) },
          { label: "Slipping", value: String(shown.filter((c) => c.slipping).length), sub: `No activity for ${SLIPPING_DAYS}+ days`, tone: shown.some((c) => c.slipping) ? "bad" : undefined },
        ]}
      />
      <DealsBoard cards={shown} stages={stages} editable={!view && EDITABLE_PRODUCTS.includes(product?.slug ?? "")} allStages={product?.stages ?? []} />
    </Page>
  );
}
