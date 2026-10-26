import type { Metadata } from "next";
import JobsBoard, { type BoardHealth, type JobItem, type LastRun } from "@/components/jobs/jobs-board";
import { currentUserId, loadProfile } from "@/lib/jobs/profile";
import { findContactEmail } from "@/lib/mail/extract";
import { blocked } from "@/lib/jobs/preferences";
import { SOURCES } from "@/lib/jobs/sources";
import { ALERT_SOURCES } from "@/lib/mail/alerts";
import { CAPTURE_SOURCE } from "@/lib/jobs/capture";
import { WHATSAPP_SOURCE } from "@/lib/import/whatsapp";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Jobs · Sales CRM", robots: { index: false } };
export const maxDuration = 300;

const COLUMNS =
  "id, source, title, company, company_logo, url, apply_url, description, location, employment_type, pay, pay_monthly_usd, posted_at, first_seen_at, score, band, eligibility, track, matched, gaps, reasons, flags, hidden_reason, status, company_info, contact_email";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ open?: string; denied?: string }> }) {
  const { open, denied } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const userId = await currentUserId();
  const [jobs, run, prof] = await Promise.all([
    supabase.from("job_posts").select(COLUMNS).eq("user_id", userId).order("score", { ascending: false }).order("posted_at", { ascending: false }).limit(600),
    supabase.from("job_runs").select("started_at, finished_at, kept, added, errors").eq("user_id", userId).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    loadProfile(supabase),
  ]);
  // The last error each board gave, from the latest search that asked it.
  const errors = new Map(((run.data?.errors ?? []) as { source?: string; error?: string }[]).filter((e) => e.source).map((e) => [e.source!, e.error ?? "no answer"]));
  const counts = new Map<string, number>();
  for (const j of jobs.data ?? []) if (!j.hidden_reason) counts.set(j.source, (counts.get(j.source) ?? 0) + 1);
  const now = new Date().getTime();
  // Boards on your skip list are never searched, so they are left out here too.
  const health: BoardHealth[] = (prof?.preferences.sources ?? [])
    .filter((id) => !blocked(SOURCES[id].home, prof!.preferences.blockedSites))
    .map((id) => ({
      id,
      name: SOURCES[id].name,
      checkedAt: prof?.sourceState[id] ?? null,
      error: errors.get(id) ?? null,
      jobs: counts.get(id) ?? 0,
      // Not read for over 30 hours: the daily search missed it.
      stale: !prof?.sourceState[id] || now - Date.parse(prof.sourceState[id]) > 30 * 3_600_000,
    }));
  const sourceNames = { ...Object.fromEntries(Object.entries(SOURCES).map(([id, s]) => [id, { name: s.name, home: s.home }])), ...ALERT_SOURCES, ...CAPTURE_SOURCE, ...WHATSAPP_SOURCE };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[80em] flex-col gap-6 px-4 py-8 md:px-8">
        {denied && (
          <p role="status" className="rounded-xl bg-(--tag-amber-bg) px-4 py-3 text-[14px] text-(--tag-amber-text)">
            That page is for the people who run this CRM, so you were brought to Jobs. Ask the owner if you need it.
          </p>
        )}
        <JobsBoard
          initialJobs={((jobs.data ?? []) as Omit<JobItem, "apply_email">[]).map((j) => ({ ...j, apply_email: j.contact_email ?? findContactEmail(j.description)?.email ?? null }))}
          lastRun={(run.data as LastRun | null) ?? null}
          sources={sourceNames}
          loadError={Boolean(jobs.error)}
          openFirst={open && /^[0-9a-f-]{36}$/i.test(open) ? open : null}
          health={health}
        />
      </div>
    </div>
  );
}
