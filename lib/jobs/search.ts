import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readJobAlerts } from "@/lib/apply/outbox";
import { type JobProfile, loadProfile } from "./profile.ts";
import { dueSources, fetchSources, nextDue, toRow, toRows } from "./run.ts";
import { scoreJob } from "./fit.ts";
import type { JobPost } from "./sources.ts";

const MINUTE = 60_000;
const DAY = 86_400_000;

export type SearchResult =
  | { ok: true; fetched: number; kept: number; added: number; skipped: string[]; errors: number; fromEmail: number | null; asked: number; nextAt: string | null }
  | { ok: false; error: string };

export async function searchJobs(admin: SupabaseClient, userId: string, trigger: "manual" | "schedule", now = new Date()): Promise<SearchResult> {
  const profile = await loadProfile(admin, userId);
  if (!profile) return { ok: false, error: "Your profile could not be loaded." };

  if (trigger === "manual") {
    const { data: last } = await admin.from("job_runs").select("started_at").eq("user_id", userId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    const ago = last ? now.getTime() - Date.parse(last.started_at) : Infinity;
    if (ago < 10 * MINUTE) return { ok: false, error: `You searched ${Math.max(1, Math.round(ago / MINUTE))} minutes ago. Try again in ${Math.ceil((10 * MINUTE - ago) / MINUTE)} minutes.` };
  }

  const due = dueSources(profile.preferences, profile.sourceState, now, trigger);
  const skipped = profile.preferences.sources.filter((id) => !due.includes(id));
  const { data: run } = await admin.from("job_runs").insert({ user_id: userId, trigger, started_at: now.toISOString() }).select("id").single();

  const fits = (title: string) => Object.values(profile.facts.tracks).some((t) => new RegExp(`\\b(?:${t.titleOk.source})`, "i").test(title));
  const result = await fetchSources(due, profile.preferences, fetch, 6, fits);
  // Job-alert emails in your Gmail (LinkedIn, Indeed, Glassdoor…) join the board results.
  const uid = Number(profile.sourceState.email_alerts_uid) || null;
  let alertError = 0;
  const alerts = await readJobAlerts(admin, userId, uid).catch(() => {
    alertError = 1;
    return null;
  });
  const rows = toRows([...result.posts, ...(alerts?.posts ?? [])], profile.facts, profile.preferences, userId, now);

  const { data: existing } = await admin
    .from("job_posts")
    .select("source, external_id")
    .eq("user_id", userId)
    .in("source", [...new Set(rows.map((r) => r.source))]);
  const known = new Set((existing ?? []).map((r) => `${r.source}|${r.external_id}`));
  const added = rows.filter((r) => !known.has(`${r.source}|${r.external_id}`)).length;

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("job_posts").upsert(rows.slice(i, i + 200), { onConflict: "user_id,source,external_id" });
    if (error) {
      await admin
        .from("job_runs")
        .update({ finished_at: new Date().toISOString(), errors: [{ error: error.message }] })
        .eq("id", run?.id);
      return { ok: false, error: "Jobs were found but could not be saved. Try again." };
    }
  }

  await rescoreSaved(admin, userId, profile, rows, now);

  await admin
    .from("job_posts")
    .delete()
    .eq("user_id", userId)
    .eq("status", "new")
    .lt("last_seen_at", new Date(now.getTime() - 30 * DAY).toISOString());

  const sourceState = { ...profile.sourceState };
  for (const id of result.fetched) sourceState[id] = now.toISOString();
  if (alerts?.lastUid) sourceState.email_alerts_uid = String(alerts.lastUid);
  await admin.from("job_profiles").update({ source_state: sourceState }).eq("user_id", userId);
  await admin.from("job_runs").update({ finished_at: new Date().toISOString(), fetched: result.posts.length, kept: rows.length, added, errors: result.errors }).eq("id", run?.id);

  return {
    ok: true,
    fetched: result.posts.length,
    kept: rows.filter((r) => !r.hidden_reason).length,
    added,
    skipped,
    errors: result.errors.length + alertError,
    fromEmail: alerts ? alerts.posts.length : null,
    asked: due.length,
    nextAt: nextDue(profile.preferences, sourceState, trigger)?.toISOString() ?? null,
  };
}

const RESCORE = "source, external_id, title, company, company_logo, url, apply_url, description, location, employment_type, tags, pay, posted_at, last_seen_at";

// Jobs not seen in this search keep their old score. Score them again, so a change to
// your profile (such as the levels you want) shows on every new job, not only fresh ones.
export async function rescoreSaved(admin: SupabaseClient, userId: string, profile: JobProfile, fresh: { source: string; external_id: string }[] = [], now = new Date()) {
  const seen = new Set(fresh.map((r) => `${r.source}|${r.external_id}`));
  const { data } = await admin.from("job_posts").select(RESCORE).eq("user_id", userId).eq("status", "new").limit(3000);
  const rows = (data ?? [])
    .filter((r) => !seen.has(`${r.source}|${r.external_id}`))
    .map((r) => {
      const post: JobPost = {
        source: r.source,
        externalId: r.external_id,
        title: r.title,
        company: r.company,
        companyLogo: r.company_logo,
        url: r.url,
        applyUrl: r.apply_url,
        description: r.description ?? "",
        location: r.location ?? "",
        restrictions: [],
        pay: r.pay,
        employmentType: r.employment_type ?? "",
        postedAt: r.posted_at,
        tags: r.tags ?? [],
      };
      // The place list is not stored: rebuild it from the location the way the boards give it.
      post.restrictions = post.location
        .split(/\s*[,;/|•]\s*/)
        .map((p) => p.trim())
        .filter((p) => p && !/^remote$/i.test(p));
      // Keep last_seen_at, so jobs that left their board still expire after 30 days.
      return toRow(post, scoreJob(post, profile.facts, profile.preferences, now), userId, new Date(r.last_seen_at));
    });
  for (let i = 0; i < rows.length; i += 200) await admin.from("job_posts").upsert(rows.slice(i, i + 200), { onConflict: "user_id,source,external_id" });
  return rows.length;
}
