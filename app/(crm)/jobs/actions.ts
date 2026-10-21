"use server";

import { revalidatePath } from "next/cache";
import { lookUpCompany, type CompanyInfo } from "@/lib/jobs/company";
import { currentUserId } from "@/lib/jobs/profile";
import { searchJobs, type SearchResult } from "@/lib/jobs/search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUSES = ["new", "saved", "applied", "dismissed"] as const;
export type JobStatus = (typeof STATUSES)[number];

export async function findJobsNow(): Promise<SearchResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in again to search for jobs." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "The CRM database is not configured." };
  const result = await searchJobs(admin, userId, "manual");
  revalidatePath("/jobs");
  return result;
}

export async function setJobStatus(id: string, status: JobStatus): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!STATUSES.includes(status)) return { ok: false, error: "Pick a valid status." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_posts")
    .update({ status, status_changed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "That job could not be updated." };
  revalidatePath("/jobs");
  return { ok: true };
}

export async function researchCompany(id: string): Promise<{ ok: true; info: CompanyInfo } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: job } = await supabase.from("job_posts").select("company, apply_url").eq("id", id).maybeSingle();
  if (!job) return { ok: false, error: "That job was not found." };
  if (!job.company) return { ok: false, error: "The post names no company to look up." };
  const info = await lookUpCompany(job.company, job.apply_url);
  await supabase.from("job_posts").update({ company_info: info }).eq("id", id);
  return { ok: true, info };
}
