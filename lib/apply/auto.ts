// Auto-apply, only when you turn it on in Profile. It picks jobs that need nothing from you:
// a strong fit you can apply to from where you live, an email address to send to, every ready
// check passing, no question in the post, no gap in the letter. Each email waits 2 hours in the
// Outbox so you can cancel it, then sends inside the employer's work hours. Form jobs are left
// for you, because they need your browser.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfile } from "@/lib/jobs/profile";
import { type AutoJob, HOLD_HOURS, looksAutomatic, readyToSend } from "./auto-rules";
import { applyByEmail, prepare } from "./outbox";

const DAY = 86_400_000;

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
    .select("id, status, band, hidden_reason, eligibility, posted_at, pay_monthly_usd, matched, gaps, contact_email, description")
    .eq("user_id", userId)
    .eq("status", "new")
    .eq("band", "strong")
    .is("hidden_reason", null)
    .order("score", { ascending: false })
    .limit(25);
  let queued = 0;
  let skipped = 0;
  for (const j of (jobs ?? []) as AutoJob[]) {
    if (left <= 0) break;
    if (looksAutomatic(j, now.getTime())) continue;
    const r = await prepare(db, userId, j.id);
    if (!r.ok || readyToSend(j, r.p, now.getTime())) {
      skipped++;
      continue;
    }
    const sent = await applyByEmail(db, userId, j.id, { to: r.p.contact!.email, subject: r.p.subject, body: r.p.body, anyway: false, holdUntil: new Date(now.getTime() + HOLD_HOURS * 3_600_000) });
    if (sent.ok) {
      queued++;
      left--;
    } else skipped++;
  }
  return { queued, skipped };
}
