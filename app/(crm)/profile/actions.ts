"use server";

import { cleanFacts, type StoredFacts } from "@/lib/jobs/facts";
import { cleanPreferences, type Preferences } from "@/lib/jobs/preferences";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveProfile(input: { facts: StoredFacts; preferences: Preferences }): Promise<{ ok: true; savedAt: string } | { ok: false; error: string }> {
  if (JSON.stringify(input ?? {}).length > 300_000) return { ok: false, error: "Your profile is too long to save. Shorten some sections." };
  const supabase = await createSupabaseServerClient();
  const current = await loadProfile(supabase);
  if (!current) return { ok: false, error: "Sign in again to save your profile." };

  const facts = cleanFacts(input.facts, current.stored);
  const preferences = cleanPreferences(input.preferences);
  const savedAt = new Date().toISOString();
  const { error } = await supabase.from("job_profiles").update({ facts, preferences, updated_at: savedAt }).eq("user_id", current.userId);
  if (error) return { ok: false, error: "Your changes were not saved. Check your connection and try again." };
  return { ok: true, savedAt };
}
