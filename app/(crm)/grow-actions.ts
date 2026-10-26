"use server";

import { revalidatePath } from "next/cache";
import { DOC_LABEL, type DocKind } from "@/lib/grow/documents";
import { cleanSteps, goalSteps, LEVELS, SCHOLARSHIP_STEPS, STATUSES, type Step, steps } from "@/lib/grow/grow";
import { currentUserId, loadProfile } from "@/lib/jobs/profile";
import { applicationSteps, draftStatement } from "@/lib/grow/statement";
import { cleanScholarshipPrefs } from "@/lib/scholarships/fit";
import { searchScholarships } from "@/lib/scholarships/search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Scholarships and your own goals. Row-level security keeps every row to its owner.

type Result = { ok: true; id?: string } | { ok: false; error: string };

const text = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export async function addScholarship(form: FormData): Promise<Result> {
  const name = text(form.get("name"), 200);
  if (!name) return { ok: false, error: "Enter the scholarship's name." };
  let url = text(form.get("url"), 1000) || null;
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (url && !/^https:\/\/[^\s]+\.[^\s]+/.test(url.replace(/^http:/, "https:"))) return { ok: false, error: "The link does not look like a web address. Check it, or leave it empty." };
  url = url?.replace(/^http:/, "https:") ?? null;
  const level = String(form.get("level") ?? "any");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("scholarships")
    .insert({
      name,
      url,
      provider: text(form.get("provider"), 200) || null,
      country: text(form.get("country"), 100) || null,
      amount: text(form.get("amount"), 120) || null,
      level: (LEVELS as readonly string[]).includes(level) ? level : "any",
      deadline: date(form.get("deadline")),
      steps: steps(SCHOLARSHIP_STEPS),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "The scholarship could not be saved. Sign in again and retry." };
  revalidatePath("/scholarships");
  return { ok: true, id: data.id };
}

export async function updateScholarship(id: string, patch: { status?: string; steps?: Step[]; note?: string; deadline?: string | null; statement?: string }): Promise<Result> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(patch.status)) return { ok: false, error: "Pick one of the listed stages." };
    update.status = patch.status;
  }
  if (patch.steps !== undefined) {
    const s = cleanSteps(patch.steps);
    if (!s) return { ok: false, error: "The checklist could not be saved." };
    update.steps = s;
  }
  if (patch.note !== undefined) update.note = patch.note.slice(0, 2000) || null;
  if (patch.statement !== undefined) update.statement = patch.statement.slice(0, 20_000) || null;
  if (patch.deadline !== undefined) update.deadline = patch.deadline && /^\d{4}-\d{2}-\d{2}$/.test(patch.deadline) ? patch.deadline : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("scholarships").update(update).eq("id", id);
  if (error) return { ok: false, error: "That change could not be saved. Reload and try again." };
  revalidatePath("/scholarships");
  return { ok: true };
}

export async function removeScholarship(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("scholarships").delete().eq("id", id);
  if (error) return { ok: false, error: "It could not be removed. Reload and try again." };
  revalidatePath("/scholarships");
  return { ok: true };
}

export async function addCareerGoal(form: FormData): Promise<Result> {
  const title = text(form.get("title"), 200);
  if (!title) return { ok: false, error: "Write the goal in a few words." };
  const horizon = form.get("horizon") === "long" ? "long" : "short";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("career_goals")
    .insert({ title, horizon, due_on: date(form.get("due")), why: text(form.get("why"), 500) || null, steps: steps(goalSteps(horizon)) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "The goal could not be saved. Sign in again and retry." };
  revalidatePath("/goals");
  return { ok: true, id: data.id };
}

export async function updateCareerGoal(id: string, patch: { steps?: Step[]; done?: boolean }): Promise<Result> {
  const update: Record<string, unknown> = {};
  if (patch.steps !== undefined) {
    const s = cleanSteps(patch.steps);
    if (!s) return { ok: false, error: "The steps could not be saved." };
    update.steps = s;
  }
  if (patch.done !== undefined) update.done_at = patch.done ? new Date().toISOString() : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("career_goals").update(update).eq("id", id);
  if (error) return { ok: false, error: "That change could not be saved. Reload and try again." };
  revalidatePath("/goals");
  return { ok: true };
}

export async function removeCareerGoal(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("career_goals").delete().eq("id", id);
  if (error) return { ok: false, error: "It could not be removed. Reload and try again." };
  revalidatePath("/goals");
  return { ok: true };
}

// A scholarship found in a chat becomes one you track, with a checklist for the documents it names.
export async function trackLead(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase.from("scholarship_leads").select("title, url, place, level, benefits, needs, deadline").eq("id", id).maybeSingle();
  if (!lead) return { ok: false, error: "That scholarship was not found. Reload the page." };
  const lv = (lead.level ?? "").toLowerCase();
  const level = /phd|doctor/.test(lv) ? "phd" : /master|postgrad/.test(lv) ? "masters" : /undergrad|bachelor/.test(lv) ? "undergraduate" : /short|course|training/.test(lv) ? "short course" : "any";
  const named = ((lead.needs ?? []) as DocKind[]).filter((k) => DOC_LABEL[k]).map((k) => `Have your ${DOC_LABEL[k].toLowerCase()} ready`);
  const { data, error } = await supabase
    .from("scholarships")
    .insert({
      name: lead.title,
      url: lead.url.replace(/^http:/, "https:"),
      country: lead.place,
      amount: ((lead.benefits ?? []) as string[])[0]?.slice(0, 120) ?? null,
      level,
      deadline: lead.deadline,
      steps: steps([...named, ...SCHOLARSHIP_STEPS].slice(0, 30)),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "It could not be added. Try again." };
  await supabase.from("scholarship_leads").update({ tracked_id: data.id }).eq("id", id);
  revalidatePath("/scholarships");
  return { ok: true, id: data.id };
}

// Starts the application: tracks the scholarship if it is not yet tracked, moves it to
// Preparing, builds the checklist from the documents it asks for, and drafts your statement.
export async function startApplication(input: { leadId?: string; scholarshipId?: string }): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const profile = await loadProfile(supabase);
  if (!profile) return { ok: false, error: "Sign in again." };
  let id = input.scholarshipId ?? null;
  let needs: DocKind[] = [];
  if (input.leadId) {
    const { data: lead } = await supabase.from("scholarship_leads").select("tracked_id, needs").eq("id", input.leadId).maybeSingle();
    if (!lead) return { ok: false, error: "That scholarship was not found. Reload the page." };
    needs = ((lead.needs ?? []) as DocKind[]).filter((k) => DOC_LABEL[k]);
    id = lead.tracked_id;
    if (!id) {
      const r = await trackLead(input.leadId);
      if (!r.ok || !r.id) return r.ok ? { ok: false, error: "It could not be added. Try again." } : r;
      id = r.id;
    }
  }
  if (!id) return { ok: false, error: "Pick a scholarship first." };
  const [{ data: s }, { data: docs }] = await Promise.all([
    supabase.from("scholarships").select("name, url, country, level, deadline, statement").eq("id", id).maybeSingle(),
    supabase.from("documents").select("kind"),
  ]);
  if (!s) return { ok: false, error: "That scholarship was not found. Reload the page." };
  const info = { name: s.name, place: s.country, level: s.level, deadline: s.deadline, url: s.url, needs };
  const have = [...new Set((docs ?? []).map((d) => d.kind as DocKind))];
  const { error } = await supabase
    .from("scholarships")
    .update({
      status: "preparing",
      steps: applicationSteps(info, have),
      // A statement you already started is never written over.
      ...(s.statement ? {} : { statement: draftStatement(profile.facts as unknown as Parameters<typeof draftStatement>[0], info) }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: "The application could not be started. Try again." };
  revalidatePath("/scholarships");
  return { ok: true, id };
}

export async function dismissLead(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("scholarship_leads").update({ dismissed: true }).eq("id", id);
  if (error) return { ok: false, error: "That change was not saved. Reload and try again." };
  revalidatePath("/scholarships");
  return { ok: true };
}

// "Find scholarships now": the same search the daily run does, for you, right away.
export async function findScholarshipsNow(): Promise<{ ok: true; added: number; errors: string[] } | { ok: false; error: string }> {
  const userId = await currentUserId();
  const admin = createSupabaseAdminClient();
  if (!userId || !admin) return { ok: false, error: "Sign in again to search." };
  const r = await searchScholarships(admin, userId, "manual");
  revalidatePath("/scholarships");
  return r.ok ? { ok: true, added: r.added, errors: r.errors } : r;
}

export async function saveScholarshipPrefs(input: unknown): Promise<Result> {
  const userId = await currentUserId();
  const admin = createSupabaseAdminClient();
  if (!userId || !admin) return { ok: false, error: "Sign in again to save." };
  // A first visit makes your profile, so a new job seeker can save these straight away.
  await loadProfile(admin, userId);
  const { data } = await admin.from("job_profiles").select("preferences").eq("user_id", userId).maybeSingle();
  const preferences = { ...((data?.preferences as Record<string, unknown>) ?? {}), scholarship: cleanScholarshipPrefs(input) };
  if (!data) return { ok: false, error: "Save your Profile once first, then set these." };
  const { error } = await admin.from("job_profiles").update({ preferences }).eq("user_id", userId);
  if (error) return { ok: false, error: "Your choices could not be saved. Try again." };
  revalidatePath("/scholarships");
  return { ok: true };
}
