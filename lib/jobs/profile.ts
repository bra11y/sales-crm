import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import SEED from "@/lib/apply/facts.js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { blankFacts, type Facts, hydrateFacts, type StoredFacts, storeFacts } from "./facts.ts";
import { cleanPreferences, DEFAULT_PREFERENCES, type Preferences } from "./preferences.ts";

export type JobProfile = { userId: string; facts: Facts; stored: StoredFacts; preferences: Preferences; sourceState: Record<string, string>; updatedAt: string };

type Row = { user_id: string; facts: StoredFacts; preferences: unknown; source_state: Record<string, string> | null; updated_at: string };

export function toProfile(row: Row): JobProfile {
  return {
    userId: row.user_id,
    facts: hydrateFacts(row.facts),
    stored: row.facts,
    preferences: cleanPreferences(row.preferences),
    sourceState: row.source_state ?? {},
    updatedAt: row.updated_at,
  };
}

export async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function loadProfile(db?: SupabaseClient, userId?: string): Promise<JobProfile | null> {
  const client = db ?? (await createSupabaseServerClient());
  const id = userId ?? (await currentUserId());
  if (!id) return null;
  const { data } = await client.from("job_profiles").select("user_id, facts, preferences, source_state, updated_at").eq("user_id", id).maybeSingle();
  if (data) return toProfile(data as Row);

  const { data: owner } = await client.from("workspace_members").select("role").eq("workspace_id", 1).eq("user_id", id).eq("role", "owner").maybeSingle();
  const base = SEED as unknown as Facts;
  const seed = { user_id: id, facts: storeFacts(owner ? base : blankFacts(base)), preferences: DEFAULT_PREFERENCES };
  const { data: made, error } = await client.from("job_profiles").insert(seed).select("user_id, facts, preferences, source_state, updated_at").single();
  if (error || !made) return null;
  return toProfile(made as Row);
}
