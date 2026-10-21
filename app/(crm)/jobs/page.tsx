import type { Metadata } from "next";
import JobsBoard, { type JobItem, type LastRun } from "@/components/jobs/jobs-board";
import { currentUserId } from "@/lib/jobs/profile";
import { SOURCES } from "@/lib/jobs/sources";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Jobs · Sales CRM", robots: { index: false } };
export const maxDuration = 300;

const COLUMNS =
  "id, source, title, company, company_logo, url, apply_url, description, location, employment_type, pay, pay_monthly_usd, posted_at, first_seen_at, score, band, eligibility, track, matched, gaps, reasons, flags, hidden_reason, status, company_info";

export default async function JobsPage() {
  const supabase = await createSupabaseServerClient();
  const userId = await currentUserId();
  const [jobs, run] = await Promise.all([
    supabase.from("job_posts").select(COLUMNS).eq("user_id", userId).order("score", { ascending: false }).order("posted_at", { ascending: false }).limit(600),
    supabase.from("job_runs").select("started_at, finished_at, kept, added, errors").eq("user_id", userId).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const sourceNames = Object.fromEntries(Object.entries(SOURCES).map(([id, s]) => [id, { name: s.name, home: s.home }]));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[80em] flex-col gap-6 px-4 py-8 md:px-8">
        <JobsBoard initialJobs={(jobs.data ?? []) as JobItem[]} lastRun={(run.data as LastRun | null) ?? null} sources={sourceNames} loadError={Boolean(jobs.error)} />
      </div>
    </div>
  );
}
