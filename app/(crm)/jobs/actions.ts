"use server";

import { revalidatePath } from "next/cache";
import { loadProfile } from "@/lib/jobs/profile";
import { cleanPreferences } from "@/lib/jobs/preferences";
import { headers } from "next/headers";
import { applyByEmail, type HiringResult, MANUAL_PROOF, markApplied, noteApplied, type Prepared, prepare, searchHiring } from "@/lib/apply/outbox";
import { lookUpCompany, type CompanyInfo } from "@/lib/jobs/company";
import { currentUserId } from "@/lib/jobs/profile";
import { rescoreSaved, searchJobs, type SearchResult } from "@/lib/jobs/search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUSES = ["new", "saved", "applied", "replied", "interview", "offer", "rejected", "no_reply", "dismissed"] as const;
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
  const { data, error } = await supabase.from("job_posts").update({ status, status_changed_at: new Date().toISOString() }).eq("id", id).select("id, user_id");
  if (error || !data?.length) return { ok: false, error: "That job could not be updated." };
  // Moves you make by hand go in the job's history too.
  const admin = createSupabaseAdminClient();
  if (admin) {
    const userId = data[0].user_id as string;
    if (status === "applied") await noteApplied(admin, userId, id, MANUAL_PROOF);
    else if (!["new", "saved", "dismissed"].includes(status))
      await admin.from("application_events").insert({ user_id: userId, job_id: id, kind: "moved", title: `You moved it to ${MOVE_LABEL[status] ?? status}`, detail: "" });
  }
  revalidatePath("/jobs");
  revalidatePath("/applications");
  return { ok: true };
}

const MOVE_LABEL: Record<string, string> = { replied: "Replied", interview: "Interview", offer: "Offer", rejected: "Not selected", no_reply: "No reply" };

export type HistoryItem = { id: string; kind: string; at: string; title: string; detail: string; evidence: Record<string, string> };

// The proof and replies for one job, newest first.
export async function getJobHistory(id: string): Promise<HistoryItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("application_events").select("id, kind, at, title, detail, evidence").eq("job_id", id).order("at", { ascending: false }).limit(50);
  return (data ?? []) as HistoryItem[];
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

async function signedIn() {
  const userId = await currentUserId();
  const admin = createSupabaseAdminClient();
  return userId && admin ? { userId, admin } : null;
}

// On Vercel the AI Gateway login comes in this header; locally it is VERCEL_OIDC_TOKEN.
async function oidc() {
  return (await headers()).get("x-vercel-oidc-token");
}

export async function prepareApplication(jobId: string, fresh = false): Promise<{ ok: true; p: Prepared } | { ok: false; error: string }> {
  const s = await signedIn();
  if (!s) return { ok: false, error: "Sign in again to apply." };
  return prepare(s.admin, s.userId, jobId, { oidc: await oidc(), fresh });
}

// Looks for a hiring email on the company's website, so you can email them instead of
// filling in their form.
export async function findHiringContact(jobId: string): Promise<({ ok: true } & HiringResult) | { ok: false; error: string }> {
  const s = await signedIn();
  if (!s) return { ok: false, error: "Sign in again." };
  const r = await searchHiring(s.admin, s.userId, jobId);
  if (r.ok && r.email) revalidatePath("/jobs");
  return r;
}

// The same for many jobs at once, a few at a time, so the page answers within a minute.
export async function findHiringContacts(jobIds: string[]): Promise<{ ok: true; found: { id: string; email: string; note: string }[]; searched: number } | { ok: false; error: string }> {
  const s = await signedIn();
  if (!s) return { ok: false, error: "Sign in again." };
  const ids = [...new Set(jobIds)].slice(0, 12);
  const found: { id: string; email: string; note: string }[] = [];
  for (let i = 0; i < ids.length; i += 4) {
    const batch = await Promise.all(ids.slice(i, i + 4).map((id) => searchHiring(s.admin, s.userId, id, false).then((r) => ({ id, r }))));
    for (const { id, r } of batch) if (r.ok && r.email) found.push({ id, email: r.email, note: r.note });
  }
  if (found.length) revalidatePath("/jobs");
  return { ok: true, found, searched: ids.length };
}

export async function sendApplication(jobId: string, input: { to: string; subject: string; body: string; anyway: boolean }) {
  const s = await signedIn();
  if (!s) return { ok: false as const, error: "Sign in again to apply." };
  const r = await applyByEmail(s.admin, s.userId, jobId, { ...input, oidc: await oidc() });
  revalidatePath("/jobs");
  revalidatePath("/outbox");
  return r;
}

export async function markJobApplied(jobId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await signedIn();
  if (!s) return { ok: false, error: "Sign in again." };
  const r = await markApplied(s.admin, s.userId, jobId);
  revalidatePath("/jobs");
  revalidatePath("/applications");
  return r.ok ? { ok: true } : r;
}

// The job titles you want, from the Jobs page's first question.
export async function saveJobTitles(titles: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const profile = await loadProfile(supabase);
  if (!profile) return { ok: false, error: "Sign in again, then try once more." };
  const preferences = cleanPreferences({ ...profile.preferences, titles });
  if (!preferences.titles.length) return { ok: false, error: "Add at least one job title." };
  const { error } = await supabase.from("job_profiles").update({ preferences, updated_at: new Date().toISOString() }).eq("user_id", profile.userId);
  if (error) return { ok: false, error: "Your job titles were not saved. Try again." };
  const admin = createSupabaseAdminClient();
  const fresh = admin ? await loadProfile(admin, profile.userId) : null;
  if (admin && fresh) await rescoreSaved(admin, profile.userId, fresh).catch(() => 0);
  revalidatePath("/jobs");
  return { ok: true };
}
