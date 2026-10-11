"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import type { Company } from "@/data/companies";
import { type NewCompanyInput, newCompanyRows } from "@/lib/crm/new-company";
import { type CompanyListRow, toCompany } from "@/lib/crm/to-company";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createCompany(
  input: NewCompanyInput & { ownerName: string },
): Promise<{ ok: true; company: Company } | { ok: false; error: string }> {
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
    supabase.from("activities").insert({ workspace_id: 1, company_id: created.id, ...rows.activity }),
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
