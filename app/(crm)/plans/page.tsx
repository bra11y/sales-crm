import type { Metadata } from "next";
import CareerGoals from "@/components/grow/career-goals";
import { Page, PageHead } from "@/components/workspace/parts";
import type { CareerGoal } from "@/lib/grow/grow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Career goals · Sales CRM", robots: { index: false } };

export default async function PlansPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("career_goals").select("id, title, horizon, due_on, why, steps, done_at").order("due_on", { ascending: true, nullsFirst: false });
  return (
    <Page>
      <PageHead title="Career goals" intro="Goals you choose: a job, a scholarship, a skill, a move. Each one starts with a few small steps, so a big goal turns into something to do this week." />
      {error && (
        <p role="alert" className="text-danger">
          Your goals could not be loaded. If this is new, the database update may not be live yet.
        </p>
      )}
      <CareerGoals goals={(data ?? []) as CareerGoal[]} now={new Date().toISOString()} />
    </Page>
  );
}
