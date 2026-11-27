import type { Metadata } from "next";
import AuditOutreach, { type Prospect, type Suggestion } from "@/components/grow/audit-outreach";
import GigList, { type GigItem } from "@/components/grow/gig-list";
import TaskSites from "@/components/grow/task-sites";
import { Page, PageHead, ViewTabs } from "@/components/workspace/parts";
import { loadGigs } from "@/lib/gigs/load";
import { gigMatch } from "@/lib/gigs/reply";
import { TASK_SITES } from "@/lib/gigs/tasks";
import { jobLevel } from "@/lib/jobs/level";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Freelance and audits · Sales CRM", robots: { index: false } };

export default async function FreelancePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const asked = (await searchParams).view;
  const view = asked === "audits" || asked === "tasks" ? asked : "gigs";
  const supabase = await createSupabaseServerClient();
  const [{ data: jobs }, { data: prospects }, { data: replies }, profile, feed] = await Promise.all([
    supabase.from("job_posts").select("company, company_info").not("company_info", "is", null).order("score", { ascending: false }).limit(200),
    supabase.from("audit_prospects").select("id, company, url, contact_name, contact_email, score, findings, status, checked_at").order("checked_at", { ascending: false, nullsFirst: false }),
    supabase.from("gig_replies").select("gig_id, status"),
    loadProfile(supabase),
    loadGigs(),
  ]);
  const stage = new Map((replies ?? []).map((r) => [r.gig_id as string, r.status as string]));
  const levels = profile?.preferences.levels ?? ["entry", "mid", "senior"];
  const gigs: GigItem[] = feed.gigs.map((g) => {
    const matched = profile ? gigMatch(g, profile.facts) : [];
    // Fits when it asks for your skills at a level you chose in Profile.
    return { ...g, matched, fits: matched.length > 0 && levels.includes(jobLevel(g.title, g.text).level), status: stage.get(g.id) ?? null };
  });
  const checked = new Set((prospects ?? []).map((p) => p.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/.*$/, "")));
  const suggestions: Suggestion[] = [];
  for (const j of jobs ?? []) {
    const site = (j.company_info as { website?: string | null } | null)?.website;
    const host = site?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
    if (site && host && !checked.has(host) && !suggestions.some((s) => s.website === site)) suggestions.push({ company: j.company, website: site });
    if (suggestions.length >= 12) break;
  }
  const views = [
    { href: "/freelance", label: "Gigs people posted", count: gigs.filter((g) => g.fits && g.status !== "not_for_me").length },
    { href: "/freelance?view=audits", label: "Audit outreach", count: (prospects ?? []).length },
    { href: "/freelance?view=tasks", label: "Small paid tasks", count: TASK_SITES.filter((s) => s.open !== "no").length },
  ];

  return (
    <Page>
      <PageHead
        title="Freelance and audits"
        intro="Short-term work you get by answering a person, not a job board: posts from people who need help, companies whose websites fail basic accessibility checks, and small paid tasks open to Nigeria."
        views={<ViewTabs label="Freelance views" views={views} current={view === "gigs" ? "/freelance" : `/freelance?view=${view}`} />}
      />
      {view === "audits" ? (
        <AuditOutreach prospects={(prospects ?? []) as Prospect[]} suggestions={suggestions} />
      ) : view === "tasks" ? (
        <TaskSites />
      ) : (
        <GigList gigs={gigs} failed={feed.failed} />
      )}
    </Page>
  );
}
