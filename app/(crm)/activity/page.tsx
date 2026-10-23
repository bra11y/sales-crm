import type { Metadata } from "next";
import ActivityFeed from "@/components/workspace/activity-feed";
import { Page, PageHead } from "@/components/workspace/parts";
import { currentUserId } from "@/lib/jobs/profile";
import { loadSales } from "@/lib/crm/sales-query";
import { type SearchParams, one } from "@/lib/crm/sales-params";
import { loadHistory } from "@/lib/crm/workspace-query";

export const metadata: Metadata = { title: "Activity · Sales CRM", robots: { index: false } };

export default async function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [sales, userId] = await Promise.all([loadSales(), currentUserId()]);
  const items = await loadHistory(sales.payments, userId);
  const company = one(params.company) ?? null;
  const companyName = company ? items.find((i) => i.companyId === company)?.companyName ?? null : null;

  return (
    <Page>
      <PageHead
        title="Activity"
        intro="Everything that happened, newest first: payments in and failed, plan changes, stage moves, applications, emails, replies and your notes. Filter it, search it, or download it."
      />
      <ActivityFeed items={items} now={new Date().toISOString()} company={company} companyName={companyName} products={sales.products} />
    </Page>
  );
}
