import type { Metadata } from "next";
import GoalBoard from "@/components/workspace/goals";
import { Page, PageHead } from "@/components/workspace/parts";
import { goalViews } from "@/lib/crm/goal-views";
import { currenciesIn } from "@/lib/crm/overview";

export const metadata: Metadata = { title: "Goals · Sales CRM", robots: { index: false } };

export default async function GoalsPage() {
  const { views, error, sales } = await goalViews();
  const currencies = currenciesIn(sales.subscriptions, sales.payments);
  return (
    <Page>
      <PageHead
        title="Goals"
        intro="Set a target for each week, month or quarter. Progress counts itself from your payments, applications, replies and notes, and shows whether you are on pace."
      />
      {error && <p role="alert" className="text-danger">Your goals could not be loaded. Reload the page.</p>}
      <GoalBoard views={views} currencies={currencies.length ? currencies : ["NGN", "USD"]} products={sales.products} />
    </Page>
  );
}
