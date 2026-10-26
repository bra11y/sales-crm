import type { Metadata } from "next";
import ChatImport from "@/components/grow/chat-import";
import ScholarshipFinder, { type FoundItem } from "@/components/grow/scholarship-finder";
import Scholarships from "@/components/grow/scholarships";
import { Page, PageHead, ViewTabs } from "@/components/workspace/parts";
import type { DocKind } from "@/lib/grow/documents";
import { type Scholarship, SOURCES as PROGRAMMES, sortScholarships } from "@/lib/grow/grow";
import { loadProfile } from "@/lib/jobs/profile";
import { FEED_NAMES } from "@/lib/scholarships/feeds";
import { scoreScholarship } from "@/lib/scholarships/fit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Scholarships · Sales CRM", robots: { index: false } };

// Like Jobs: found scholarships scored for you, a side panel for each, and a tracker.
export default async function ScholarshipsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const v = (await searchParams).view;
  const view = v === "tracking" || v === "add" ? v : "found";
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [profile, { data: tracked, error }, { data: leadRows }, { data: docRows }] = await Promise.all([
    loadProfile(),
    supabase.from("scholarships").select("id, name, provider, url, level, country, amount, deadline, status, steps, note"),
    supabase
      .from("scholarship_leads")
      .select("id, title, url, place, eligible, level, benefits, needs, deadline, deadline_text, source, fully_funded, summary, tracked_id, created_at")
      .eq("dismissed", false)
      .or(`deadline.is.null,deadline.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(1500),
    supabase.from("documents").select("kind, expires_on"),
  ]);
  const have = [...new Set((docRows ?? []).filter((d) => !d.expires_on || d.expires_on >= today).map((d) => d.kind as DocKind))];
  const prefs = profile?.preferences.scholarship ?? { levels: [], fundedOnly: false, places: [], country: "Nigeria" };
  // The same scholarship often comes from a chat and a site under two links: show it once.
  const seen = new Set<string>();
  const items: FoundItem[] = (leadRows ?? [])
    .filter((l) => {
      const key = l.title
        .toLowerCase()
        .replace(/\b20\d\d\b|\(.*?\)|\|.*$|[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((l) => ({ ...(l as Omit<FoundItem, "score" | "band" | "hidden" | "reasons">), ...scoreScholarship(l as never, prefs, have, today) }))
    .sort((a, b) => Number(Boolean(a.hidden)) - Number(Boolean(b.hidden)) || b.score - a.score || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  const list = sortScholarships((tracked ?? []) as Scholarship[], now);
  const lastFound = (leadRows ?? [])[0]?.created_at ?? null;
  const views = [
    { href: "/scholarships", label: "For you", count: items.filter((i) => !i.hidden).length },
    { href: "/scholarships?view=tracking", label: "Tracking", count: list.length },
    { href: "/scholarships?view=add", label: "Add or import" },
  ];

  return (
    <Page wide={view === "found"}>
      <PageHead
        title="Scholarships"
        intro="Found for you every morning from scholarship sites and your WhatsApp groups, scored on your level, funding, deadline and the documents you have. Open one to see the details and track it."
        views={<ViewTabs label="Scholarship views" views={views} current={view === "found" ? "/scholarships" : `/scholarships?view=${view}`} />}
      />
      {error && (
        <p role="alert" className="text-danger">
          Your scholarships could not be loaded. Reload the page.
        </p>
      )}
      {view === "found" && <ScholarshipFinder items={items} have={have} prefs={prefs} sources={FEED_NAMES} now={now.toISOString()} lastFound={lastFound} />}
      {view === "tracking" && <Scholarships part="list" list={list} have={have} now={now.toISOString()} />}
      {view === "add" && (
        <>
          <ChatImport />
          <Scholarships part="add" list={list} have={have} now={now.toISOString()} />
          <section aria-labelledby="programmes" className="flex flex-col gap-3">
            <h2 id="programmes" className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
              Big programmes to look at
            </h2>
            <p className="text-soft px-1 leading-normal">Official sites only. Dates change every year, so check each site for this year&rsquo;s deadline before you add it.</p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PROGRAMMES.map((s) => (
                <li key={s.name} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-white/[0.04] px-4 py-3">
                  <a href={s.url} target="_blank" rel="noopener" className="font-medium break-words underline underline-offset-2">
                    {s.name}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <span className="text-soft text-[14px]">
                    {s.where} · {s.level}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Page>
  );
}
