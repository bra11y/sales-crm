// Runs the grant search for one person: read the grant feeds and the general opportunity
// feeds, keep new business grants, and save them. One request per feed page, so the
// sites are never hammered.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FEEDS, type FeedItem, parseFeed } from "../scholarships/feeds.ts";
import { GRANT_FEEDS, isBusinessGrant, toGrant } from "./grants.ts";

type Fetcher = typeof fetch;
const UA = "SalesCRM-GrantFinder/1.0 (+https://sales-crm-virid-ten.vercel.app)";
const BUSINESS_FEEDS = FEEDS.filter((f) => ["opportunitiesforafricans", "opportunitydesk", "opportunitiesforyouth", "youthopportunitieshub", "opportunitiescorners"].includes(f.id));

export type GrantRun = { ok: true; added: number; found: number; errors: string[] } | { ok: false; error: string };

export async function searchGrants(db: SupabaseClient, userId: string, fetcher: Fetcher = fetch): Promise<GrantRun> {
  const { data: have, error } = await db.from("grant_leads").select("url").eq("user_id", userId).limit(10_000);
  if (error) return { ok: false, error: "Your grants could not be read. Try again." };
  const known = new Set((have ?? []).map((r) => r.url));
  const errors: string[] = [];
  const fresh: { source: string; item: FeedItem }[] = [];

  for (const feed of [...GRANT_FEEDS, ...BUSINESS_FEEDS]) {
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
        const add = all.filter(isBusinessGrant).filter((i) => !known.has(i.url));
        for (const item of add) {
          known.add(item.url);
          fresh.push({ source: feed.id, item });
        }
        if (!all.length || all.every((i) => known.has(i.url) && !add.includes(i))) break;
      } catch (e) {
        errors.push(`${feed.name}: ${e instanceof Error ? e.message : "no answer"}`);
        break;
      }
    }
  }

  const rows = fresh.map(({ source, item }) => {
    const g = toGrant(item);
    return {
      user_id: userId,
      title: g.title,
      url: g.url,
      eligible: g.eligible || null,
      amount: g.amount || null,
      deadline: g.deadline,
      deadline_text: g.deadlineText || null,
      shared_at: g.sharedAt,
      source,
      summary: g.summary || null,
    };
  });

  let added = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error: e } = await db
      .from("grant_leads")
      .upsert(rows.slice(i, i + 200), { onConflict: "user_id,url", ignoreDuplicates: true })
      .select("id");
    if (e) return { ok: false, error: "New grants were found but could not be saved. Try again." };
    added += data?.length ?? 0;
  }
  return { ok: true, added, found: fresh.length, errors };
}

export const GRANT_SOURCE_NAMES: Record<string, string> = {
  ...Object.fromEntries([...GRANT_FEEDS, ...BUSINESS_FEEDS].map((f) => [f.id, f.name])),
  you: "Added by you",
};
