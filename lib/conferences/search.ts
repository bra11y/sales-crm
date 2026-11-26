// Runs the conference search for one person: read the conference feeds and the general
// opportunity feeds, keep conferences, and save the new ones. One request per feed page.

import type { SupabaseClient } from "@supabase/supabase-js";
import { type Feed, FEEDS, type FeedItem, parseFeed } from "../scholarships/feeds.ts";
import { pageText } from "../scholarships/search.ts";
import { CONFERENCE_FEEDS, isConference, SHARED_ON_X, toConference, X_PICKS } from "./conferences.ts";

type Fetcher = typeof fetch;
const UA = "SalesCRM-ConferenceFinder/1.0 (+https://sales-crm-virid-ten.vercel.app)";
const GENERAL_FEEDS = FEEDS.filter((f) => ["opportunitiesforafricans", "opportunitydesk", "opportunitiesforyouth", "opportunitiescorners", "youthopportunitieshub"].includes(f.id));

export type ConferenceRun = { ok: true; added: number; found: number; errors: string[] } | { ok: false; error: string };

export async function searchConferences(db: SupabaseClient, userId: string, fetcher: Fetcher = fetch): Promise<ConferenceRun> {
  const { data: have, error } = await db.from("conferences").select("url").eq("user_id", userId).limit(10_000);
  if (error) return { ok: false, error: "Your conferences could not be read. Try again." };
  const known = new Set((have ?? []).map((r) => r.url));
  const errors: string[] = [];
  const fresh: { feed: Feed; item: FeedItem }[] = [];

  for (const feed of [...CONFERENCE_FEEDS, ...GENERAL_FEEDS]) {
    for (let page = 1; page <= feed.pages; page++) {
      try {
        const res = await fetcher(page === 1 ? feed.url : `${feed.url}?paged=${page}`, {
          headers: { "user-agent": UA, accept: "application/rss+xml, application/xml" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          if (page === 1) errors.push(`${feed.name} answered ${res.status}`);
          break;
        }
        const all = parseFeed(await res.text());
        const add = all.filter(isConference).filter((i) => !known.has(i.url));
        for (const item of add) {
          known.add(item.url);
          fresh.push({ feed, item });
        }
        if (!all.length || all.every((i) => known.has(i.url) && !add.includes(i))) break;
      } catch (e) {
        errors.push(`${feed.name}: ${e instanceof Error ? e.message : "no answer"}`);
        break;
      }
    }
  }

  // Detail pages, one at a time with a pause, so the sites are never hammered. The fee and
  // deadline are usually only on the full page.
  let budget = 20;
  const rows = [];
  for (const { feed, item } of fresh) {
    let page = "";
    if (feed.details && budget > 0) {
      budget--;
      try {
        const res = await fetcher(item.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
        if (res.ok) page = pageText(await res.text());
        await new Promise((r) => setTimeout(r, 600));
      } catch {
        page = "";
      }
    }
    const source = feed.id;
    const c = toConference(item, page);
    rows.push({ user_id: userId, name: c.name, url: c.url, apply_url: c.apply_url, place: c.place, dates: c.dates, deadline: c.deadline, deadline_text: c.deadline_text, fee: c.fee, covers: c.covers, eligible: c.eligible, summary: c.summary, warnings: c.warnings, source });
  }
  let added = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error: e } = await db.from("conferences").upsert(rows.slice(i, i + 200), { onConflict: "user_id,url", ignoreDuplicates: true }).select("id");
    if (e) return { ok: false, error: "New conferences were found but could not be saved. Try again." };
    added += data?.length ?? 0;
  }
  return { ok: true, added, found: fresh.length, errors };
}

// Adds the conferences shared on X that are not on your list yet.
export async function addXPicks(db: SupabaseClient, userId: string): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const rows = X_PICKS.map((c) => ({ user_id: userId, ...c, source: SHARED_ON_X, status: "found" }));
  const { data, error } = await db.from("conferences").upsert(rows, { onConflict: "user_id,url", ignoreDuplicates: true }).select("id");
  return error ? { ok: false, error: "They could not be added. Sign in again and retry." } : { ok: true, added: data?.length ?? 0 };
}

export const CONFERENCE_SOURCE_NAMES: Record<string, string> = {
  ...Object.fromEntries([...CONFERENCE_FEEDS, ...GENERAL_FEEDS].map((f) => [f.id, f.name])),
  [SHARED_ON_X]: "Shared on X by @Web3empresss",
  you: "Added by you",
};
