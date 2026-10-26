"use server";

import { revalidatePath } from "next/cache";
import type { Company } from "@/data/companies";
import { stageChange } from "@/lib/crm/application-stage";
import { checkGoal } from "@/lib/crm/goals";
import { EDITABLE_PRODUCTS as EDITABLE } from "@/lib/crm/pipelines";
import { type CompanyListRow, toCompany } from "@/lib/crm/to-company";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function readBack(companyId: string): Promise<Result<{ company: Company }>> {
  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase.from("company_list").select("*").eq("id", companyId).single();
  if (!row) return { ok: false, error: "Saved, but it could not be read back. Reload the page." };
  return { ok: true, company: toCompany(row as CompanyListRow, new Date()) };
}

export async function moveCompany(companyId: string, stage: string, note = ""): Promise<Result<{ company: Company }>> {
  const supabase = await createSupabaseServerClient();
  const { data: c } = await supabase.from("companies").select("product, stage").eq("id", companyId).maybeSingle();
  if (!c) return { ok: false, error: "That company was not found." };
  if (!EDITABLE.includes(c.product)) return { ok: false, error: "This stage comes from the app's own billing. Change the plan in the app." };
  if (c.stage === stage) return readBack(companyId);

  const now = new Date().toISOString();
  let update: Record<string, unknown>;
  let summary: string;
  let dealStatus: "open" | "won" | "lost" = "open";
  if (c.product === "applications") {
    const change = stageChange(stage, note);
    if (!change.ok) return change;
    update = { stage: change.stage, win_probability: change.winProbability };
    summary = change.summary;
    dealStatus = change.dealStatus;
  } else {
    const { data: p } = await supabase.from("products").select("stages").eq("slug", c.product).single();
    if (!p?.stages.includes(stage)) return { ok: false, error: "Pick one of this pipeline's stages." };
    update = { stage };
    summary = `Moved to ${stage}`;
  }
  const { error } = await supabase
    .from("companies")
    .update({ ...update, updated_at: now })
    .eq("id", companyId);
  if (error) return { ok: false, error: "The stage could not be saved. Only the workspace owner can move companies." };
  await Promise.all([
    supabase.from("deals").update({ stage, status: dealStatus, updated_at: now }).eq("company_id", companyId),
    supabase.from("activities").insert({ workspace_id: 1, company_id: companyId, kind: "stage.changed", summary, at: now }),
  ]);
  revalidatePath("/deals");
  return readBack(companyId);
}

export async function updateCompanyValue(companyId: string, valueMajor: number, winProbability: number): Promise<Result<{ company: Company }>> {
  if (!Number.isFinite(valueMajor) || valueMajor < 0 || valueMajor > 1e11) return { ok: false, error: "Enter a value of 0 or more." };
  if (!Number.isInteger(winProbability) || winProbability < 0 || winProbability > 100) return { ok: false, error: "Win chance is a whole number from 0 to 100." };
  const supabase = await createSupabaseServerClient();
  const { data: c } = await supabase.from("companies").select("product").eq("id", companyId).maybeSingle();
  if (!c) return { ok: false, error: "That company was not found." };
  if (!EDITABLE.includes(c.product)) return { ok: false, error: "This value comes from the app's plan price. Change the plan in the app." };
  const minor = Math.round(valueMajor * 100);
  const { error } = await supabase.from("companies").update({ pipeline_value_minor: minor, win_probability: winProbability, updated_at: new Date().toISOString() }).eq("id", companyId);
  if (error) return { ok: false, error: "The value could not be saved. Only the workspace owner can edit companies." };
  await supabase.from("deals").update({ value_minor: minor, updated_at: new Date().toISOString() }).eq("company_id", companyId);
  return readBack(companyId);
}

export async function addNote(companyId: string, text: string): Promise<Result<{ company: Company }>> {
  const note = text.trim();
  if (!note) return { ok: false, error: "Write the note first." };
  if (note.length > 1000) return { ok: false, error: "Keep the note under 1,000 characters." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("activities").insert({ workspace_id: 1, company_id: companyId, kind: "note", summary: note, at: new Date().toISOString() });
  if (error) return { ok: false, error: "The note could not be saved. Only the workspace owner can add notes." };
  return readBack(companyId);
}

export type CompanyRecord = {
  payments: { amount_minor: number; currency: string; status: string; paid_at: string; provider: string; reference: string }[];
  subscriptions: { product: string; plan: string; status: string; amount_minor: number; currency: string; interval_months: number; renews_at: string | null; started_at: string | null }[];
  contacts: { name: string; email: string | null; phone: string | null }[];
  activities: { id: number; kind: string; summary: string; at: string }[];
  stages: string[];
  editable: boolean;
};

export async function getCompanyRecord(companyId: string): Promise<Result<{ record: CompanyRecord }>> {
  const supabase = await createSupabaseServerClient();
  const [company, pays, subs, contacts, acts] = await Promise.all([
    supabase.from("companies").select("product, products(stages)").eq("id", companyId).maybeSingle(),
    supabase.from("payments").select("amount_minor, currency, status, paid_at, provider, reference").eq("company_id", companyId).order("paid_at", { ascending: false }).limit(200),
    supabase.from("subscriptions").select("product, plan, status, amount_minor, currency, interval_months, renews_at, started_at").eq("company_id", companyId),
    supabase.from("contacts").select("name, email, phone").eq("company_id", companyId).order("name"),
    supabase.from("activities").select("id, kind, summary, at").eq("company_id", companyId).order("at", { ascending: false }).limit(100),
  ]);
  if (!company.data || pays.error || acts.error) return { ok: false, error: "This company's record could not be loaded. Reload the page." };
  const product = company.data.product as string;
  return {
    ok: true,
    record: {
      payments: pays.data ?? [],
      subscriptions: subs.data ?? [],
      contacts: contacts.data ?? [],
      activities: acts.data ?? [],
      stages: (company.data.products as unknown as { stages: string[] } | null)?.stages ?? [],
      editable: EDITABLE.includes(product),
    },
  };
}

// ---------- goals ----------

export async function createGoal(input: { metric: string; period: string; target: number; currency?: string; product?: string; note?: string }): Promise<Result> {
  const checked = checkGoal(input);
  if (!checked.ok) return checked;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("goals").insert(checked.goal);
  if (error) return { ok: false, error: "The goal could not be saved. Sign in again and retry." };
  revalidatePath("/goals");
  revalidatePath("/overview");
  return { ok: true };
}

export async function updateGoalTarget(id: string, metricIsMoney: boolean, target: number): Promise<Result> {
  if (!Number.isFinite(target) || target <= 0) return { ok: false, error: "Enter a target above zero." };
  const value = Math.round(metricIsMoney ? target * 100 : target);
  if (value < 1 || value >= 1e13) return { ok: false, error: "That target is too big." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("goals").update({ target: value }).eq("id", id);
  if (error) return { ok: false, error: "The target could not be saved." };
  revalidatePath("/goals");
  revalidatePath("/overview");
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) return { ok: false, error: "The goal could not be removed." };
  revalidatePath("/goals");
  revalidatePath("/overview");
  return { ok: true };
}
