"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import type { Company } from "@/data/companies";
import { stageChange } from "@/lib/crm/application-stage";
import type { ApplicationData } from "@/lib/crm/events";
import { type NewCompanyInput, newCompanyRows } from "@/lib/crm/new-company";
import { type CompanyListRow, toCompany } from "@/lib/crm/to-company";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createCompany(input: NewCompanyInput & { ownerName: string }): Promise<{ ok: true; company: Company } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: owner } = await supabase.from("profiles").select("user_id").eq("name", input.ownerName).maybeSingle();
  const rows = newCompanyRows(input, {
    ownerId: owner?.user_id ?? null,
    externalId: randomUUID(),
    today: new Date().toISOString().slice(0, 10),
  });
  if (!rows.ok) return rows;

  const { data: created, error } = await supabase.from("companies").insert(rows.company).select("id").single();
  if (error || !created) {
    return { ok: false, error: "The company could not be saved. Only the workspace owner can add companies. Try again." };
  }

  const extra = [
    supabase.from("activities").insert(rows.activities.map((a) => ({ workspace_id: 1, company_id: created.id, ...a }))),
    ...(rows.deal ? [supabase.from("deals").insert({ workspace_id: 1, company_id: created.id, ...rows.deal })] : []),
  ];
  const results = await Promise.all(extra);
  if (results.some((r) => r.error)) {
    return { ok: false, error: "The company was saved, but its first activity was not. Reload the page to see it." };
  }

  const { data: row } = await supabase.from("company_list").select("*").eq("id", created.id).single();
  if (!row) return { ok: false, error: "The company was saved but could not be read back. Reload the page." };
  return { ok: true, company: toCompany(row as CompanyListRow, new Date()) };
}

export type ApplicationEntry = {
  id: number;
  at: string;
  kind: string;
  summary: string;
  role?: string;
  jobPost?: string;
  documents?: ApplicationData["documents"];
};

type ActivityRow = { id: number; kind: string; summary: string; at: string; event_id: string | null };
type EventRow = { event_id: string; payload: { data?: { application?: ApplicationData } } };

export async function getApplicationHistory(companyId: string): Promise<{ ok: true; entries: ApplicationEntry[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: activities, error } = await supabase.from("activities").select("id, kind, summary, at, event_id").eq("company_id", companyId).order("at", { ascending: false }).limit(50);
  if (error || !activities) return { ok: false, error: "The history could not be loaded. Reload the page." };

  const ids = (activities as ActivityRow[]).map((a) => a.event_id).filter((id): id is string => Boolean(id));
  const { data: events } = ids.length ? await supabase.from("events").select("event_id, payload").in("event_id", ids) : { data: [] };
  const sent = new Map(((events ?? []) as EventRow[]).map((e) => [e.event_id, e.payload.data?.application]));

  return {
    ok: true,
    entries: (activities as ActivityRow[]).map((a) => {
      const application = a.event_id ? sent.get(a.event_id) : undefined;
      return {
        id: a.id,
        at: a.at,
        kind: a.kind,
        summary: a.summary,
        role: application?.role,
        jobPost: application?.job_post,
        documents: application?.documents,
      };
    }),
  };
}

export async function moveApplication(companyId: string, stage: string, note: string): Promise<{ ok: true; company: Company } | { ok: false; error: string }> {
  const change = stageChange(stage, note);
  if (!change.ok) return change;
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("companies").update({ stage: change.stage, win_probability: change.winProbability, updated_at: now }).eq("id", companyId).eq("product", "applications");
  if (error) return { ok: false, error: "The stage could not be saved. Only the workspace owner can move applications." };

  const results = await Promise.all([
    supabase.from("deals").update({ stage: change.stage, status: change.dealStatus, updated_at: now }).eq("company_id", companyId),
    supabase.from("activities").insert({ workspace_id: 1, company_id: companyId, kind: "stage.changed", summary: change.summary, at: now }),
  ]);
  if (results.some((r) => r.error)) return { ok: false, error: "The stage was saved, but its note was not. Reload the page." };

  const { data: row } = await supabase.from("company_list").select("*").eq("id", companyId).single();
  if (!row) return { ok: false, error: "The stage was saved but could not be read back. Reload the page." };
  return { ok: true, company: toCompany(row as CompanyListRow, new Date()) };
}
