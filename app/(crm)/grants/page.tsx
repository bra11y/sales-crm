import type { Metadata } from "next";
import { AddGrant, AnswerBank, type FoundGrantItem, GrantFinder, GrantTracker } from "@/components/grow/grants";
import { Page, PageHead, ViewTabs } from "@/components/workspace/parts";
import { type Grant, type GrantAnswer, scoreGrant, sortGrants } from "@/lib/grants/grants";
import { GRANT_SOURCE_NAMES } from "@/lib/grants/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Grants · Sales CRM", robots: { index: false } };

const VIEWS = ["found", "tracking", "add", "answers"] as const;
type View = (typeof VIEWS)[number];

export default async function GrantsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const v = (await searchParams).view;
  const view: View = (VIEWS as readonly string[]).includes(v ?? "") ? (v as View) : "found";
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [{ data: leadRows, error: leadError }, { data: tracked, error }, { data: answers }] = await Promise.all([
    supabase
      .from("grant_leads")
      .select("id, title, url, eligible, amount, deadline, deadline_text, source, summary, tracked_id, created_at")
      .eq("dismissed", false)
      .or(`deadline.is.null,deadline.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("grants").select("id, name, provider, url, business, amount, deadline, status, note, applied_on"),
    supabase.from("grant_answers").select("id, question, answer, business, updated_at").order("updated_at", { ascending: false }),
  ]);
  const items: FoundGrantItem[] = (leadRows ?? [])
    .map((l) => ({ ...l, ...scoreGrant(l, today) }))
    .sort((a, b) => Number(Boolean(a.hidden)) - Number(Boolean(b.hidden)) || b.score - a.score || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  const list = sortGrants((tracked ?? []) as Grant[]);
  const views = [
    { href: "/grants", label: "Found for you", count: items.filter((i) => !i.hidden).length },
    { href: "/grants?view=tracking", label: "Tracking", count: list.length },
    { href: "/grants?view=answers", label: "Answer bank", count: (answers ?? []).length },
    { href: "/grants?view=add", label: "Add a grant" },
  ];

  return (
    <Page wide={view === "found"}>
      <PageHead
        title="Grants"
        intro="Business grants found for you every morning from opportunity sites, scored for a Nigerian business. Track the ones you go for, and keep your best answers so the next form takes minutes."
        views={<ViewTabs label="Grant views" views={views} current={view === "found" ? "/grants" : `/grants?view=${view}`} />}
      />
      {(error || leadError) && (
        <p role="alert" className="text-danger">
          Your grants could not be loaded. Reload the page.
        </p>
      )}
      {view === "found" && <GrantFinder items={items} sources={GRANT_SOURCE_NAMES} now={now.toISOString()} lastFound={(leadRows ?? [])[0]?.created_at ?? null} />}
      {view === "tracking" && <GrantTracker list={list} now={now.toISOString()} />}
      {view === "answers" && <AnswerBank answers={(answers ?? []) as GrantAnswer[]} />}
      {view === "add" && <AddGrant />}
    </Page>
  );
}
