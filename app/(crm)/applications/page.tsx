import type { Metadata } from "next";
import ApplicationsBoard, { type AppItem, type Latest } from "@/components/jobs/applications-board";
import { currentUserId } from "@/lib/jobs/profile";
import { SOURCES } from "@/lib/jobs/sources";
import { ALERT_SOURCES } from "@/lib/mail/alerts";
import { CAPTURE_SOURCE } from "@/lib/jobs/capture";
import { findContactEmail } from "@/lib/mail/extract";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Applications · Sales CRM",
  robots: { index: false },
};
export const maxDuration = 300;

const COLUMNS =
  "id, source, title, company, company_logo, url, apply_url, description, location, employment_type, pay, pay_monthly_usd, posted_at, first_seen_at, score, band, eligibility, track, matched, gaps, reasons, flags, hidden_reason, status, company_info, contact_email, applied_at, applied_via, confirmed_at";

export default async function ApplicationsPage() {
  const supabase = await createSupabaseServerClient();
  const userId = await currentUserId();
  const { data: jobs, error } = await supabase
    .from("job_posts")
    .select(COLUMNS)
    .eq("user_id", userId)
    .in("status", ["saved", "applied", "replied", "interview", "offer", "rejected", "no_reply"])
    .order("status_changed_at", { ascending: false, nullsFirst: false })
    .limit(500);
  const ids = (jobs ?? []).map((j) => j.id as string);
  const { data: events } = ids.length ? await supabase.from("application_events").select("job_id, kind, title, at").in("job_id", ids).order("at", { ascending: false }).limit(2000) : { data: [] };
  const latest = new Map<string, Latest>();
  for (const e of events ?? []) if (!latest.has(e.job_id)) latest.set(e.job_id, { kind: e.kind, title: e.title, at: e.at });
  const sources = {
    ...Object.fromEntries(Object.entries(SOURCES).map(([id, s]) => [id, { name: s.name, home: s.home }])),
    ...ALERT_SOURCES,
    ...CAPTURE_SOURCE,
  };
  const items = ((jobs ?? []) as Omit<AppItem, "apply_email" | "latest">[]).map((j) => ({
    ...j,
    apply_email: j.contact_email ?? findContactEmail(j.description)?.email ?? null,
    latest: latest.get(j.id) ?? null,
  }));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex w-full flex-col gap-5 px-4 py-8 md:px-8">
        {error && <p className="text-danger">Your applications could not be loaded. Refresh the page to try again.</p>}
        <ApplicationsBoard initial={items} sources={sources} />
      </div>
    </div>
  );
}
