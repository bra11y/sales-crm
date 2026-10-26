import type { Metadata } from "next";
import CareerGoals from "@/components/grow/career-goals";
import GoalBoard from "@/components/workspace/goals";
import { Page, PageHead, ViewTabs } from "@/components/workspace/parts";
import { asRole, can } from "@/lib/auth/permissions";
import { goalViews } from "@/lib/crm/goal-views";
import { currenciesIn } from "@/lib/crm/overview";
import type { CareerGoal } from "@/lib/grow/grow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Goals · Sales CRM", robots: { index: false } };

// One Goals page: your own goals for everyone, and sales targets for the people who run the CRM.
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const role = asRole((await supabase.rpc("my_role")).data);
  const targets = can(role, "crm:use") && (await searchParams).view === "targets";
  const views = can(role, "crm:use")
    ? [
        { href: "/goals", label: "Your goals" },
        { href: "/goals?view=targets", label: "Sales targets" },
      ]
    : null;

  if (targets) {
    const { views: goals, error, sales } = await goalViews();
    const currencies = currenciesIn(sales.subscriptions, sales.payments);
    return (
      <Page>
        <PageHead
          title="Goals"
          intro="Set a target for each week, month or quarter. Progress counts itself from your payments, applications, replies and notes, and shows whether you are on pace."
          views={views && <ViewTabs label="Goal views" views={views} current="/goals?view=targets" />}
        />
        {error && (
          <p role="alert" className="text-danger">
            Your targets could not be loaded. Reload the page.
          </p>
        )}
        <GoalBoard views={goals} currencies={currencies.length ? currencies : ["NGN", "USD"]} products={sales.products} />
      </Page>
    );
  }

  const { data, error } = await supabase.from("career_goals").select("id, title, horizon, due_on, why, steps, done_at").order("due_on", { ascending: true, nullsFirst: false });
  return (
    <Page>
      <PageHead
        title="Goals"
        intro="Goals you choose: a job, a scholarship, a skill, a move. Each one starts with a few small steps, so a big goal turns into something to do this week."
        views={views && <ViewTabs label="Goal views" views={views} current="/goals" />}
      />
      {error && (
        <p role="alert" className="text-danger">
          Your goals could not be loaded. Reload the page.
        </p>
      )}
      <CareerGoals goals={(data ?? []) as CareerGoal[]} now={new Date().toISOString()} />
    </Page>
  );
}
