// Runs the scholarship search for one person: read each feed, keep new opportunities,
// read the detail page where the feed is thin, and save them. Fit is worked out when
// the page loads, from your current preferences and documents, so it is never stale.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FEEDS, type FeedItem, isOpportunity, parseFeed, toFound } from "./feeds.ts";

type Fetcher = typeof fetch;
const UA = "SalesCRM-ScholarshipFinder/1.0 (+https://sales-crm-virid-ten.vercel.app)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The article text of a WordPress page: scripts, styles and menus removed.
export function pageText(html: string): string {
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html.match(/<div[^>]+class="[^"]*entry-content[\s\S]*?<\/div>\s*<\/div>/i)?.[0] ?? html;
  return article
    .replace(/<(script|style|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, 12_000);
}

export type ScholarshipRun = { ok: true; added: number; found: number; errors: string[] } | { ok: false; error: string };

export async function searchScholarships(db: SupabaseClient, userId: string, trigger: "manual" | "schedule", fetcher: Fetcher = fetch): Promise<ScholarshipRun> {
  const { data: have, error } = await db.from("scholarship_leads").select("url").eq("user_id", userId).limit(10_000);
  if (error) return { ok: false, error: "Your scholarships could not be read. Try again." };
  const known = new Set((have ?? []).map((r) => r.url));
  const errors: string[] = [];
  const fresh: { feed: (typeof FEEDS)[number]; item: FeedItem }[] = [];

  for (const feed of FEEDS) {
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
        const items = parseFeed(await res.text()).filter(isOpportunity);
        const add = items.filter((i) => !known.has(i.url));
        for (const item of add) {
          known.add(item.url);
          fresh.push({ feed, item });
        }
        // An older page with nothing new means the rest is already saved.
        if (!add.length) break;
      } catch (e) {
        errors.push(`${feed.name}: ${e instanceof Error ? e.message : "no answer"}`);
        break;
      }
    }
  }

  // Detail pages, one at a time with a pause, so the sites are never hammered.
  let budget = trigger === "schedule" ? 25 : 8;
  const rows = [];
  for (const { feed, item } of fresh) {
    let extra = "";
    if (feed.details && budget > 0) {
      budget--;
      try {
        const res = await fetcher(item.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
        if (res.ok) extra = pageText(await res.text());
        await sleep(600);
      } catch {
        // The listing still saves without its details.
      }
    }
    const f = toFound(item, extra);
    rows.push({
      user_id: userId,
      title: f.title,
      url: f.url,
      place: f.place || null,
      eligible: f.eligible || null,
      level: f.level || null,
      benefits: f.benefits,
      needs: f.needs,
      deadline: f.deadline,
      deadline_text: f.deadlineText || null,
      shared_at: f.sharedAt,
      source: feed.id,
      fully_funded: f.fullyFunded,
      summary: f.summary || null,
    });
  }

  let added = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error: e } = await db
      .from("scholarship_leads")
      .upsert(rows.slice(i, i + 200), { onConflict: "user_id,url", ignoreDuplicates: true })
      .select("id");
    if (e) return { ok: false, error: "New scholarships were found but could not be saved. Try again." };
    added += data?.length ?? 0;
  }
  return { ok: true, added, found: fresh.length, errors };
}
