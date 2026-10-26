"use server";

import { revalidatePath } from "next/cache";
import { DOC_LABEL, type DocKind } from "@/lib/grow/documents";
import { cleanSteps, goalSteps, LEVELS, SCHOLARSHIP_STEPS, STATUSES, type Step, steps } from "@/lib/grow/grow";
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

export async function updateScholarship(id: string, patch: { status?: string; steps?: Step[]; note?: string; deadline?: string | null }): Promise<Result> {
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
  revalidatePath("/plans");
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
  revalidatePath("/plans");
  return { ok: true };
}

export async function removeCareerGoal(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("career_goals").delete().eq("id", id);
  if (error) return { ok: false, error: "It could not be removed. Reload and try again." };
  revalidatePath("/plans");
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
  await supabase.from("scholarship_leads").update({ dismissed: true }).eq("id", id);
  revalidatePath("/scholarships");
  return { ok: true, id: data.id };
}

export async function dismissLead(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("scholarship_leads").update({ dismissed: true }).eq("id", id);
  if (error) return { ok: false, error: "That change was not saved. Reload and try again." };
  revalidatePath("/scholarships");
  return { ok: true };
}
