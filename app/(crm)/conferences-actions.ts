"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { aiProviders } from "@/lib/apply/ai";
import { draftAnswers } from "@/lib/conferences/answers";
import { cleanQuestions, type Conference, CONFERENCE_STATUSES, feeOf, warningsFor } from "@/lib/conferences/conferences";
import { addXPicks, searchConferences } from "@/lib/conferences/search";
import { currentUserId, loadProfile } from "@/lib/jobs/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { ok: true; id?: string; note?: string } | { ok: false; error: string; field?: "name" | "url" };

const text = (v: FormDataEntryValue | null | undefined, max: number) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const date = (v: FormDataEntryValue | null | undefined) => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const link = (raw: string): string | null | false => {
  if (!raw) return null;
  const u = (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/^http:/i, "https:");
  return /^https:\/\/[^\s]+\.[^\s]+/.test(u) ? u.slice(0, 1000) : false;
};

export async function addConference(form: FormData): Promise<Result> {
  const name = text(form.get("name"), 200);
  if (!name) return { ok: false, error: "Enter the conference's name.", field: "name" };
  const url = link(text(form.get("url"), 1000));
  if (!url) return { ok: false, error: "Enter the link to the conference page, starting with https://.", field: "url" };
  const fee = text(form.get("fee"), 200);
  const questions = text(form.get("questions"), 3000)
    .split("\n")
    .map((q) => q.trim())
    .filter(Boolean)
    .map((line) => {
      const limit = line.match(/\((\d{2,4})\s*words?\)\s*$/i)?.[1];
      return { q: line.replace(/\s*\(\d{2,4}\s*words?\)\s*$/i, "").slice(0, 300), limit: limit ? Number(limit) : null, answer: "" };
    });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("conferences")
    .insert({
      name,
      url,
      place: text(form.get("place"), 120) || null,
      dates: text(form.get("dates"), 120) || null,
      deadline: date(form.get("deadline")),
      fee: fee || null,
      warnings: warningsFor(fee, feeOf(fee) || fee),
      questions: cleanQuestions(questions),
      source: "you",
      status: "interested",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "That conference is already on your list." : "The conference could not be saved. Sign in again and retry.", field: error?.code === "23505" ? "url" : undefined };
  revalidatePath("/conferences");
  return { ok: true, id: data.id };
}

export async function updateConference(id: string, patch: { status?: string; note?: string }): Promise<Result> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) {
    if (!(CONFERENCE_STATUSES as readonly string[]).includes(patch.status)) return { ok: false, error: "Pick one of the listed stages." };
    update.status = patch.status;
    if (patch.status === "applied") update.applied_on = new Date().toISOString().slice(0, 10);
  }
  if (patch.note !== undefined) update.note = patch.note.trim().slice(0, 2000) || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("conferences").update(update).eq("id", id);
  if (error) return { ok: false, error: "That change was not saved. Reload and try again." };
  revalidatePath("/conferences");
  return { ok: true };
}

export async function saveQuestions(id: string, questions: unknown): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("conferences")
    .update({ questions: cleanQuestions(questions), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Your answers were not saved. Reload and try again." };
  revalidatePath("/conferences");
  return { ok: true };
}

export async function draftConferenceAnswers(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const [{ data: row }, profile] = await Promise.all([supabase.from("conferences").select("*").eq("id", id).maybeSingle(), loadProfile()]);
  if (!row) return { ok: false, error: "That conference was not found. Reload the page." };
  if (!profile) return { ok: false, error: "Your Profile could not be loaded. Sign in again." };
  const c = { ...row, questions: cleanQuestions(row.questions) } as Conference;
  if (!c.questions.length) return { ok: false, error: "Add the form's questions first, then draft the answers." };
  const oidc = (await headers()).get("x-vercel-oidc-token");
  const r = await draftAnswers(c, profile.facts, profile.preferences.voice, profile.preferences.ai === "off" ? [] : aiProviders(process.env, oidc));
  const { error } = await supabase
    .from("conferences")
    .update({ questions: r.questions, status: r.written && (c.status === "found" || c.status === "interested") ? "drafted" : c.status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "The answers were written but not saved. Try again." };
  revalidatePath("/conferences");
  return { ok: true, note: r.note };
}

export async function addSharedOnX(): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in again." };
  const supabase = await createSupabaseServerClient();
  const r = await addXPicks(supabase, userId);
  if (!r.ok) return r;
  revalidatePath("/conferences");
  return { ok: true, note: r.added ? `${r.added} conference${r.added === 1 ? "" : "s"} added.` : "They are already on your list." };
}

export async function findConferencesNow(): Promise<{ ok: true; added: number; errors: string[] } | { ok: false; error: string }> {
  const userId = await currentUserId();
  const admin = createSupabaseAdminClient();
  if (!userId || !admin) return { ok: false, error: "Sign in again to search." };
  const r = await searchConferences(admin, userId);
  revalidatePath("/conferences");
  return r.ok ? { ok: true, added: r.added, errors: r.errors } : r;
}
