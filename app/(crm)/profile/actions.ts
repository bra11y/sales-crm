"use server";

import { cleanFacts, type StoredFacts } from "@/lib/jobs/facts";
import { cleanPreferences, type Preferences } from "@/lib/jobs/preferences";
import { loadProfile } from "@/lib/jobs/profile";
import { createExtensionToken } from "@/lib/apply/kit";
import { connectGmail, sendTestEmail } from "@/lib/apply/outbox";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

async function mailUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const admin = createSupabaseAdminClient();
  return data.user && admin ? { userId: data.user.id, admin } : null;
}

export async function connectMail(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again to connect Gmail." };
  const r = await connectGmail(s.admin, s.userId, String(email ?? "").slice(0, 200), String(password ?? "").slice(0, 100));
  return r.ok ? { ok: true } : r;
}

export async function sendMailTest(): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again." };
  return sendTestEmail(s.admin, s.userId);
}

export async function disconnectMail(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again." };
  await s.admin.from("applications_outbox").update({ status: "cancelled", error: "Gmail was disconnected." }).eq("user_id", s.userId).eq("status", "queued");
  const { error } = await s.admin.from("mail_accounts").delete().eq("user_id", s.userId);
  return error ? { ok: false, error: "Gmail could not be disconnected. Try again." } : { ok: true };
}

export async function makeExtensionCode(): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again." };
  return { ok: true, code: await createExtensionToken(s.admin, s.userId) };
}

export async function revokeExtensionCode(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again." };
  const { error } = await s.admin.from("extension_tokens").delete().eq("user_id", s.userId);
  return error ? { ok: false, error: "The code could not be turned off. Try again." } : { ok: true };
}
