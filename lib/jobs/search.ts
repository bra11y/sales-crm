import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfile } from "./profile.ts";
import { dueSources, fetchSources, toRows } from "./run.ts";

const MINUTE = 60_000;
const DAY = 86_400_000;

export type SearchResult = { ok: true; fetched: number; kept: number; added: number; skipped: string[]; errors: number } | { ok: false; error: string };

export async function searchJobs(admin: SupabaseClient, userId: string, trigger: "manual" | "schedule", now = new Date()): Promise<SearchResult> {
  const profile = await loadProfile(admin, userId);
  if (!profile) return { ok: false, error: "Your profile could not be loaded." };

  if (trigger === "manual") {
    const { data: last } = await admin.from("job_runs").select("started_at").eq("user_id", userId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    const ago = last ? now.getTime() - Date.parse(last.started_at) : Infinity;
    if (ago < 10 * MINUTE) return { ok: false, error: `You searched ${Math.max(1, Math.round(ago / MINUTE))} minutes ago. Try again in ${Math.ceil((10 * MINUTE - ago) / MINUTE)} minutes.` };
  }

  const due = dueSources(profile.preferences, profile.sourceState, now);
  const skipped = profile.preferences.sources.filter((id) => !due.includes(id));
  const { data: run } = await admin.from("job_runs").insert({ user_id: userId, trigger, started_at: now.toISOString() }).select("id").single();

  const result = await fetchSources(due, profile.preferences);
  const rows = toRows(result.posts, profile.facts, profile.preferences, userId, now);

  const { data: existing } = await admin.from("job_posts").select("source, external_id").eq("user_id", userId).in("source", [...new Set(rows.map((r) => r.source))]);
  const known = new Set((existing ?? []).map((r) => `${r.source}|${r.external_id}`));
  const added = rows.filter((r) => !known.has(`${r.source}|${r.external_id}`)).length;

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("job_posts").upsert(rows.slice(i, i + 200), { onConflict: "user_id,source,external_id" });
    if (error) {
      await admin.from("job_runs").update({ finished_at: new Date().toISOString(), errors: [{ error: error.message }] }).eq("id", run?.id);
      return { ok: false, error: "Jobs were found but could not be saved. Try again." };
    }
  }

  await admin.from("job_posts").delete().eq("user_id", userId).eq("status", "new").lt("last_seen_at", new Date(now.getTime() - 30 * DAY).toISOString());

  const sourceState = { ...profile.sourceState };
  for (const id of result.fetched) sourceState[id] = now.toISOString();
  await admin.from("job_profiles").update({ source_state: sourceState }).eq("user_id", userId);
  await admin
    .from("job_runs")
    .update({ finished_at: new Date().toISOString(), fetched: result.posts.length, kept: rows.length, added, errors: result.errors })
    .eq("id", run?.id);

  return { ok: true, fetched: result.posts.length, kept: rows.filter((r) => !r.hidden_reason).length, added, skipped, errors: result.errors.length };
}
