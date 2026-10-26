import "server-only";
import { USER_AGENT } from "../jobs/run.ts";
import { type Gig, gigsFromHn, gigsFromMastodon, HN_ITEM, HN_SEARCH, MASTODON_TAG, MASTODON_TAGS } from "./feeds.ts";

const DAY = 86_400_000;
// Each feed is read at most once an hour, shared by everyone who opens the page.
const get = async (url: string) => {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

async function newestThread(query: string, title: RegExp, author?: string): Promise<string | null> {
  const r = (await get(HN_SEARCH(query, author))) as { hits: { objectID: string; title: string }[] };
  return r.hits.find((h) => title.test(h.title))?.objectID ?? null;
}

export async function loadGigs(now = new Date()): Promise<{ gigs: Gig[]; failed: string[] }> {
  const failed: string[] = [];
  const tasks: Promise<Gig[]>[] = [
    (async () => {
      const id = await newestThread("Who is hiring", /^Ask HN: Who is hiring\?/, "whoishiring");
      return id ? gigsFromHn(await get(HN_ITEM(id))) : [];
    })(),
    (async () => {
      const id = await newestThread("Freelancer? Seeking freelancer?", /^Ask HN: Freelancer\? Seeking freelancer\?/);
      return id ? gigsFromHn(await get(HN_ITEM(id)), true) : [];
    })(),
    ...MASTODON_TAGS.map(async (t) => gigsFromMastodon(await get(MASTODON_TAG(t)))),
  ];
  const names = ["Hacker News: Who is hiring", "Hacker News: Seeking freelancer", ...MASTODON_TAGS.map((t) => `Mastodon #${t}`)];
  const all: Gig[] = [];
  (await Promise.allSettled(tasks)).forEach((r, i) => (r.status === "fulfilled" ? all.push(...r.value) : failed.push(names[i])));
  // One copy of each post, newest first, nothing older than 45 days.
  const seen = new Set<string>();
  const gigs = all
    .filter((g) => now.getTime() - Date.parse(g.postedAt) < 45 * DAY && !seen.has(g.id) && seen.add(g.id))
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
  return { gigs, failed };
}
