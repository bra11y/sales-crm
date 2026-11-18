"use server";

import { revalidatePath } from "next/cache";
import { cleanAnswer, GRANT_STATUSES } from "@/lib/grants/grants";
import { searchGrants } from "@/lib/grants/search";
import { currentUserId } from "@/lib/jobs/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Grants for your business, and your answer bank. Row-level security keeps every row to its owner.

type Result = { ok: true; id?: string } | { ok: false; error: string };

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

export async function addGrant(form: FormData): Promise<Result> {
  const name = text(form.get("name"), 200);
  if (!name) return { ok: false, error: "Enter the grant's name." };
  const url = link(text(form.get("url"), 1000));
  if (url === false) return { ok: false, error: "The link does not look like a web address. Check it, or leave it empty." };
  const status = text(form.get("status"), 20) || "interested";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("grants")
    .insert({
      name,
      url,
      provider: text(form.get("provider"), 200) || null,
      business: text(form.get("business"), 120) || null,
      amount: text(form.get("amount"), 120) || null,
      deadline: date(form.get("deadline")),
      status: (GRANT_STATUSES as readonly string[]).includes(status) ? status : "interested",
      applied_on: status === "applied" ? new Date().toISOString().slice(0, 10) : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "The grant could not be saved. Sign in again and retry." };
  revalidatePath("/grants");
  return { ok: true, id: data.id };
}

export async function updateGrant(id: string, patch: { status?: string; note?: string; business?: string }): Promise<Result> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) {
    if (!(GRANT_STATUSES as readonly string[]).includes(patch.status)) return { ok: false, error: "Pick one of the listed stages." };
    update.status = patch.status;
    if (patch.status === "applied") update.applied_on = new Date().toISOString().slice(0, 10);
  }
  if (patch.note !== undefined) update.note = patch.note.trim().slice(0, 2000) || null;
  if (patch.business !== undefined) update.business = patch.business.trim().slice(0, 120) || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("grants").update(update).eq("id", id);
  if (error) return { ok: false, error: "That change was not saved. Reload and try again." };
  revalidatePath("/grants");
  return { ok: true };
}

export async function removeGrant(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("grants").delete().eq("id", id);
  if (error) return { ok: false, error: "It could not be removed. Reload and try again." };
  revalidatePath("/grants");
  return { ok: true };
}

export async function trackGrantLead(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase.from("grant_leads").select("title, url, amount, deadline").eq("id", id).maybeSingle();
  if (!lead) return { ok: false, error: "That grant was not found. Reload the page." };
  const { data, error } = await supabase.from("grants").insert({ name: lead.title, url: lead.url, amount: lead.amount, deadline: lead.deadline }).select("id").single();
  if (error || !data) return { ok: false, error: "It could not be added. Try again." };
  await supabase.from("grant_leads").update({ tracked_id: data.id }).eq("id", id);
  revalidatePath("/grants");
  return { ok: true, id: data.id };
}

export async function dismissGrantLead(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("grant_leads").update({ dismissed: true }).eq("id", id);
  if (error) return { ok: false, error: "That change was not saved. Reload and try again." };
  revalidatePath("/grants");
  return { ok: true };
}

// "Find grants now": the same search the daily run does, for you, right away.
export async function findGrantsNow(): Promise<{ ok: true; added: number; errors: string[] } | { ok: false; error: string }> {
  const userId = await currentUserId();
  const admin = createSupabaseAdminClient();
  if (!userId || !admin) return { ok: false, error: "Sign in again to search." };
  const r = await searchGrants(admin, userId);
  revalidatePath("/grants");
  return r.ok ? { ok: true, added: r.added, errors: r.errors } : r;
}

export async function saveAnswer(input: { id?: string; question: string; answer: string; business?: string }): Promise<Result> {
  const c = cleanAnswer(input);
  if (!c.ok) return c;
  const supabase = await createSupabaseServerClient();
  const q = input.id
    ? supabase
        .from("grant_answers")
        .update({ ...c.value, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .select("id")
        .single()
    : supabase.from("grant_answers").insert(c.value).select("id").single();
  const { data, error } = await q;
  if (error || !data) return { ok: false, error: "The answer could not be saved. Sign in again and retry." };
  revalidatePath("/grants");
  return { ok: true, id: data.id };
}

export async function removeAnswer(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("grant_answers").delete().eq("id", id);
  if (error) return { ok: false, error: "It could not be removed. Reload and try again." };
  revalidatePath("/grants");
  return { ok: true };
}
