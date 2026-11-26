// Auto-apply, only when you turn it on in Profile. It picks jobs that need nothing from you:
// a strong fit you can apply to from where you live, every ready check passing, no question in
// the post, no gap in the letter. A post with no email has the company's website searched for a
// hiring inbox first. Each email waits 2 hours in the Outbox so you can cancel it, then sends
// inside the employer's work hours. Whatever is left for you gets its reason saved on the job,
// and the morning email lists it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfile } from "@/lib/jobs/profile";
import { type AutoJob, HOLD_HOURS, looksAutomatic, needsLookup, readyToSend } from "./auto-rules";
import { applyByEmail, prepare } from "./outbox";

const DAY = 86_400_000;
// Each website search can take 25 seconds, so an hourly run does a few and the next run does more.
const LOOKUPS_PER_RUN = 4;

export async function autoApply(db: SupabaseClient, userId: string, now = new Date()): Promise<{ queued: number; skipped: number }> {
  const profile = await loadProfile(db, userId);
  const auto = profile?.preferences.autoApply;
  if (!auto?.on) return { queued: 0, skipped: 0 };
  const { count } = await db
    .from("applications_outbox")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("auto", true)
    .gte("created_at", new Date(now.getTime() - DAY).toISOString());
  let left = auto.perDay - (count ?? 0);
  if (left <= 0) return { queued: 0, skipped: 0 };

  const { data: jobs } = await db
    .from("job_posts")
    .select("id, status, band, hidden_reason, eligibility, posted_at, pay_monthly_usd, matched, gaps, contact_email, contact_source, description, needs_you, company_info")
    .eq("user_id", userId)
    .eq("status", "new")
    .eq("band", "strong")
    .is("hidden_reason", null)
    .order("score", { ascending: false })
    .limit(25);
  let queued = 0;
  let skipped = 0;
  let lookups = 0;
  const leave = async (j: AutoJob & { needs_you?: string | null }, why: string) => {
    skipped++;
    if (j.needs_you !== why) await db.from("job_posts").update({ needs_you: why.slice(0, 300) }).eq("id", j.id);
  };
  for (const j of (jobs ?? []) as (AutoJob & { needs_you?: string | null; company_info?: { hiring?: unknown } | null })[]) {
    if (left <= 0) break;
    const quick = looksAutomatic(j, now.getTime());
    if (quick) {
      if (quick !== "already handled") await leave(j, quick);
      continue;
    }
    if (needsLookup(j) && !j.company_info?.hiring) {
      if (lookups >= LOOKUPS_PER_RUN) continue;
      lookups++;
    }
    const r = await prepare(db, userId, j.id);
    if (!r.ok) {
      await leave(j, r.error);
      continue;
    }
    const why = readyToSend({ ...j, contact_email: r.p.contact?.email ?? null }, r.p, now.getTime());
    if (why) {
      await leave(j, why);
      continue;
    }
    const sent = await applyByEmail(db, userId, j.id, { to: r.p.contact!.email, subject: r.p.subject, body: r.p.body, anyway: false, holdUntil: new Date(now.getTime() + HOLD_HOURS * 3_600_000) });
    if (sent.ok) {
      queued++;
      left--;
      if (j.needs_you) await db.from("job_posts").update({ needs_you: null }).eq("id", j.id);
    } else await leave(j, sent.error);
  }
  return { queued, skipped };
}
