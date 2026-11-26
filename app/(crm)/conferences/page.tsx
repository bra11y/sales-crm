import type { Metadata } from "next";
import { AddConference, ConferenceFinder, ConferenceTracker } from "@/components/grow/conferences";
import { Page, PageHead, ViewTabs } from "@/components/workspace/parts";
import { cleanQuestions, type Conference, sortConferences, X_PICKS } from "@/lib/conferences/conferences";
import { CONFERENCE_SOURCE_NAMES } from "@/lib/conferences/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conferences · Sales CRM", robots: { index: false } };

const VIEWS = ["found", "tracking", "add"] as const;
type View = (typeof VIEWS)[number];

export default async function ConferencesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const v = (await searchParams).view;
  const view: View = (VIEWS as readonly string[]).includes(v ?? "") ? (v as View) : "found";
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("conferences")
    .select("id, name, url, apply_url, place, dates, deadline, deadline_text, fee, covers, eligible, summary, warnings, questions, source, status, note, applied_on")
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(500);
  const all = (data ?? []).map((c) => ({ ...c, questions: cleanQuestions(c.questions), warnings: c.warnings ?? [] })) as Conference[];
  const open = (c: Conference) => !c.deadline || c.deadline >= today;
  const found = all.filter((c) => c.status === "found" && open(c)).sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  const tracking = sortConferences(all.filter((c) => c.status !== "found"));
  const have = new Set(all.map((c) => c.url));
  const { data: dismissed } = await supabase.from("conferences").select("url").eq("status", "dismissed");
  for (const d of dismissed ?? []) have.add(d.url);
  const sharedLeft = X_PICKS.filter((p) => p.deadline && p.deadline >= today && !have.has(p.url)).length;
  const views = [
    { href: "/conferences", label: "Found for you", count: found.length },
    { href: "/conferences?view=tracking", label: "Tracking", count: tracking.length },
    { href: "/conferences?view=add", label: "Add a conference" },
  ];

  return (
    <Page wide={view !== "add"}>
      <PageHead
        title="Conferences"
        intro="Funded conferences found every morning, plus ones you add. Each shows the real fee to apply, your answers are drafted from your Profile, and deadlines reach your morning email."
        views={<ViewTabs label="Conference views" views={views} current={view === "found" ? "/conferences" : `/conferences?view=${view}`} />}
      />
      {error && (
        <p role="alert" className="text-danger">
          Your conferences could not be loaded. Reload the page.
        </p>
      )}
      {view === "found" && <ConferenceFinder items={found} sources={CONFERENCE_SOURCE_NAMES} now={now.toISOString()} sharedLeft={sharedLeft} />}
      {view === "tracking" && <ConferenceTracker list={tracking} now={now.toISOString()} />}
      {view === "add" && <AddConference />}
    </Page>
  );
}
