import type { Facts } from "./facts.ts";
import { dedupe, type Fit, scoreJob } from "./fit.ts";
import type { Preferences } from "./preferences.ts";
import { type JobPost, SOURCES, type SourceId } from "./sources.ts";

const HOUR = 3_600_000;
export const USER_AGENT = "SalesCRM-JobFinder/1.0 (+https://sales-crm-virid-ten.vercel.app)";

export function dueSources(prefs: Preferences, state: Record<string, string>, now = new Date()): SourceId[] {
  return prefs.sources.filter((id) => {
    const last = Date.parse(state[id] ?? "");
    return !Number.isFinite(last) || now.getTime() - last >= SOURCES[id].minHoursBetween * HOUR;
  });
}

export type JobRow = ReturnType<typeof toRows>[number];

export function toRow(p: JobPost, f: Fit, userId: string, now = new Date()) {
  return {
    user_id: userId,
    source: p.source,
    external_id: p.externalId.slice(0, 300),
    title: p.title.slice(0, 300),
    company: p.company.slice(0, 200),
    company_logo: p.companyLogo?.startsWith("https://") ? p.companyLogo : null,
    url: p.url,
    apply_url: p.applyUrl,
    description: p.description,
    location: p.location.slice(0, 500),
    employment_type: p.employmentType.slice(0, 80),
    tags: p.tags.slice(0, 20),
    pay: p.pay,
    pay_monthly_usd: f.payMonthlyUsd,
    posted_at: p.postedAt,
    last_seen_at: now.toISOString(),
    score: f.score,
    band: f.band,
    eligibility: f.eligibility,
    track: f.track,
    matched: f.matched,
    gaps: f.gaps,
    reasons: f.reasons,
    flags: f.flags,
    hidden_reason: f.hidden,
  };
}

export function toRows(posts: JobPost[], facts: Facts, prefs: Preferences, userId: string, now = new Date()) {
  return dedupe(posts)
    .map((p) => ({ p, f: scoreJob(p, facts, prefs, now) }))
    .filter(({ f }) => f.hidden !== "Outside your fields")
    .map(({ p, f }) => toRow(p, f, userId, now))
    .filter((r) => r.url.startsWith("https://") && r.apply_url.startsWith("https://"));
}

export type Fetched = { posts: JobPost[]; errors: { source: SourceId; url: string; error: string }[]; fetched: SourceId[] };

async function getOnce(url: string, fetcher: typeof fetch) {
  const res = await fetcher(url, { headers: { "user-agent": USER_AGENT, accept: "application/json, application/rss+xml" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { http: true });
  return res.text();
}

export async function fetchSources(ids: SourceId[], prefs: Preferences, fetcher: typeof fetch = fetch, parallel = 6): Promise<Fetched> {
  const out: Fetched = { posts: [], errors: [], fetched: [] };
  const ok = new Set<SourceId>();
  const queue = ids.flatMap((id) => SOURCES[id].urls(prefs).map((url) => ({ id, url })));
  async function worker() {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { id, url } = job;
      try {
        let body: string;
        try {
          body = await getOnce(url, fetcher);
        } catch (first) {
          if ((first as { http?: boolean }).http) throw first;
          body = await getOnce(url, fetcher);
        }
        out.posts.push(...SOURCES[id].parse(body, url));
        ok.add(id);
      } catch (cause) {
        out.errors.push({ source: id, url, error: cause instanceof Error ? cause.message.slice(0, 200) : "Failed" });
      }
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));
  out.fetched = [...ok];
  return out;
}
