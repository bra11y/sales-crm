"use server";

import { revalidatePath } from "next/cache";
import { checkReplies, sendDue } from "@/lib/apply/outbox";
import { currentUserId } from "@/lib/jobs/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Done = { ok: true; note: string } | { ok: false; error: string };

async function user() {
  const userId = await currentUserId();
  const admin = createSupabaseAdminClient();
  return userId && admin ? { userId, admin } : null;
}

export async function cancelEmail(id: string): Promise<Done> {
  const s = await user();
  if (!s) return { ok: false, error: "Sign in again." };
  const { data } = await s.admin.from("applications_outbox").update({ status: "cancelled", error: "You cancelled it." }).eq("id", id).eq("user_id", s.userId).eq("status", "queued").select("id");
  revalidatePath("/outbox");
  return data?.length ? { ok: true, note: "Cancelled. It will not be sent." } : { ok: false, error: "It was already sent or cancelled." };
}

export async function sendEmailNow(id: string): Promise<Done> {
  const s = await user();
  if (!s) return { ok: false, error: "Sign in again." };
  const now = new Date();
  const { data } = await s.admin.from("applications_outbox").update({ send_after: now.toISOString() }).eq("id", id).eq("user_id", s.userId).eq("status", "queued").select("id");
  if (!data?.length) return { ok: false, error: "It was already sent or cancelled." };
  const r = await sendDue(s.admin, s.userId, now, Date.now() + 20_000, id);
  revalidatePath("/outbox");
  if (r.sent) return { ok: true, note: "Sent." };
  return r.errors.length ? { ok: false, error: `Gmail did not send it: ${r.errors[0]}` } : { ok: true, note: r.waiting ?? "It sends on the next run." };
}

export async function retryEmail(id: string): Promise<Done> {
  const s = await user();
  if (!s) return { ok: false, error: "Sign in again." };
  const { data } = await s.admin.from("applications_outbox").update({ status: "queued", error: null }).eq("id", id).eq("user_id", s.userId).eq("status", "failed").select("id");
  if (!data?.length) return { ok: false, error: "Only a failed email can be retried." };
  return sendEmailNow(id);
}

export async function checkRepliesNow(): Promise<Done> {
  const s = await user();
  if (!s) return { ok: false, error: "Sign in again." };
  const r = await checkReplies(s.admin, s.userId);
  revalidatePath("/outbox");
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, note: r.found ? `${r.found} new ${r.found === 1 ? "reply" : "replies"} found.` : "No new replies yet." };
}

const STAGE_STATUS = { interview: "replied", replied: "replied", closed: "dismissed" } as const;

export async function confirmReply(id: string, stage: keyof typeof STAGE_STATUS): Promise<Done> {
  const s = await user();
  if (!s || !(stage in STAGE_STATUS)) return { ok: false, error: "Sign in again." };
  const { data } = await s.admin.from("application_replies").update({ confirmed: true, suggested_stage: stage }).eq("id", id).eq("user_id", s.userId).select("job_id");
  const jobId = data?.[0]?.job_id;
  if (jobId) await s.admin.from("job_posts").update({ status: STAGE_STATUS[stage], status_changed_at: new Date().toISOString() }).eq("id", jobId).eq("user_id", s.userId);
  revalidatePath("/outbox");
  return data?.length ? { ok: true, note: "Saved." } : { ok: false, error: "That reply was not found." };
}
