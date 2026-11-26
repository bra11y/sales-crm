import type { Metadata } from "next";
import Coach from "@/components/coach/coach";
import { Page, PageHead } from "@/components/workspace/parts";
import { currentUserId, loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Job coach · Sales CRM", robots: { index: false } };
export const maxDuration = 120;

export default async function CoachPage() {
  const db = await createSupabaseServerClient();
  const userId = await currentUserId();
  const [jobs, profile] = await Promise.all([
    db.from("job_posts").select("id, title, company, status").eq("user_id", userId).is("hidden_reason", null).in("status", ["new", "saved", "applied", "replied", "interview"]).order("score", { ascending: false }).limit(60),
    loadProfile(db),
  ]);
  const options = (jobs.data ?? []).map((j) => ({ id: j.id as string, label: `${j.title} · ${j.company}${["applied", "replied", "interview"].includes(j.status) ? " (applied)" : ""}` }));
  return (
    <Page wide>
      <PageHead
        title="Job coach"
        intro="The prompts people share for ChatGPT and Claude, built in: it already knows your Profile and your saved jobs. It never invents experience; a line with a number you never gave is removed."
      />
      <Coach jobs={options} firstRole={profile?.preferences.titles[0] ?? ""} />
    </Page>
  );
}
