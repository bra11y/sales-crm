// The morning email: what the night's work could not finish without you. It goes to your own
// Gmail once a day, only when something is waiting, and lists each item with its reason and
// a link straight to it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { looksAutomatic, type AutoJob } from "../apply/auto-rules.ts";
import { dayKey, mindsetFor } from "../motivation.ts";
import { topicsFor } from "../study/topics.ts";

export const APP_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sales-crm-virid-ten.vercel.app").replace(/\/$/, "");
const DAY = 86_400_000;
const SOON_DAYS = 5;

export type DigestJob = { id: string; title: string; company: string; reason: string; applyUrl: string };
export type DigestDeadline = { kind: "Conference" | "Grant" | "Scholarship"; name: string; deadline: string; href: string; extra?: string };
export type DigestStudy = { name: string; category: string; slug: string };
export type DigestInput = { today: string; queued: number; jobs: DigestJob[]; deadlines: DigestDeadline[]; autoOn: boolean; study?: DigestStudy[]; mindset?: { name: string; line: string; today: string }; post?: string };

const daysTo = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / DAY);
const when = (d: number) => (d <= 0 ? "closes today" : d === 1 ? "closes tomorrow" : `closes in ${d} days`);

export function buildDigest(x: DigestInput): { subject: string; text: string; count: number; study: number } {
  const count = x.jobs.length + x.deadlines.length;
  const parts: string[] = [];
  const head =
    x.queued > 0
      ? `Overnight, ${x.queued} application${x.queued === 1 ? " was" : "s were"} queued for you. Each waits 2 hours in the Outbox so you can cancel it: ${APP_URL}/outbox`
      : x.autoOn
        ? "Overnight, no application could go out without you."
        : "Auto-apply is off, so nothing was sent overnight. Turn it on in Settings to have email jobs sent for you.";
  parts.push("Good morning,", "");
  if (x.mindset) parts.push(`Today's mindset: ${x.mindset.name}. ${x.mindset.line}`, `Today: ${x.mindset.today}`, "");
  parts.push(head, "");
  const urgent = [...x.deadlines].sort((a, b) => a.deadline.localeCompare(b.deadline));
  if (urgent.length) {
    parts.push(`Deadlines in the next ${SOON_DAYS} days (${urgent.length})`, "");
    for (const d of urgent) parts.push(`- ${d.kind}: ${d.name}, ${when(daysTo(d.deadline, x.today))} (${d.deadline}).${d.extra ? ` ${d.extra}` : ""}`, `  ${d.href}`);
    parts.push("");
  }
  if (x.jobs.length) {
    parts.push(`Jobs that need you (${x.jobs.length})`, "");
    for (const j of x.jobs) parts.push(`- ${j.title}${j.company ? ` at ${j.company}` : ""}: ${j.reason}.`, `  Open it: ${APP_URL}/apply?job=${j.id}`);
    parts.push("");
  }
  const study = x.study ?? [];
  if (study.length) {
    parts.push("Today's study (5 minutes each)", "");
    for (const t of study) parts.push(`- ${t.name} (${t.category})`, `  ${APP_URL}/study?topic=${t.slug}`);
    parts.push("");
  }
  if (x.post) parts.push("Today's post for X (check it, then post it yourself)", "", x.post, "", `Quote, reference and thread: ${APP_URL}/study#post-h`, "");
  parts.push(count ? "Nothing else needs you today." : "Nothing needs you today.", "", `Turn this email off in Settings: ${APP_URL}/settings`, "");
  const subject = count
    ? `${count} thing${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} you today${urgent.length ? `, first deadline ${urgent[0].deadline}` : ""}`
    : study.length
      ? `Today's study: ${study.map((t) => t.name).join(", ")}`
      : "Your morning update";
  return { subject, text: parts.join("\n"), count, study: study.length };
}

type JobRow = AutoJob & { title: string; company: string; apply_url: string; needs_you: string | null };

export async function gatherDigest(db: SupabaseClient, userId: string, now: Date, autoOn: boolean): Promise<DigestInput> {
  const today = now.toISOString().slice(0, 10);
  const soon = new Date(now.getTime() + SOON_DAYS * DAY).toISOString().slice(0, 10);
  const since = new Date(now.getTime() - DAY).toISOString();
  const [jobs, queued, conferences, grants, scholarships, post] = await Promise.all([
    db
      .from("job_posts")
      .select("id, title, company, apply_url, status, band, hidden_reason, eligibility, posted_at, pay_monthly_usd, matched, gaps, contact_email, contact_source, description, needs_you")
      .eq("user_id", userId)
      .eq("status", "new")
      .eq("band", "strong")
      .is("hidden_reason", null)
      .order("score", { ascending: false })
      .limit(12),
    db.from("applications_outbox").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("auto", true).gte("created_at", since),
    db.from("conferences").select("id, name, deadline, fee, status, questions").eq("user_id", userId).in("status", ["found", "interested", "drafted"]).gte("deadline", today).lte("deadline", soon),
    db.from("grants").select("id, name, deadline").eq("user_id", userId).in("status", ["interested", "preparing"]).gte("deadline", today).lte("deadline", soon),
    db.from("scholarships").select("id, name, deadline").eq("user_id", userId).in("status", ["interested", "preparing"]).gte("deadline", today).lte("deadline", soon),
    db.from("daily_posts").select("post").eq("day", dayKey(now)).maybeSingle(),
  ]);
  const t = now.getTime();
  const pending = (jobs.data ?? []) as JobRow[];
  return {
    today,
    autoOn,
    study: topicsFor(dayKey(now)).map((x) => ({ name: x.name, category: x.category, slug: x.slug })),
    mindset: mindsetFor(now),
    post: ((post.data?.post ?? null) as { text?: string } | null)?.text,
    queued: queued.count ?? 0,
    jobs: pending
      .map((j) => ({ id: j.id, title: j.title, company: j.company, applyUrl: j.apply_url, reason: j.needs_you ?? looksAutomatic(j, t) ?? (autoOn ? "" : "auto-apply is off, so it waits for you") }))
      .filter((j) => j.reason && j.reason !== "already handled" && j.reason !== "older than 3 weeks")
      .slice(0, 8),
    deadlines: [
      ...(conferences.data ?? []).map((c) => {
        const empty = ((c.questions ?? []) as { answer: string }[]).filter((q) => !q.answer).length;
        const steps = [c.status === "found" ? "Decide if you are going for it." : "", empty ? `${empty} answer${empty === 1 ? "" : "s"} still empty.` : "", c.fee ? `Fee to apply: ${c.fee}` : ""].filter(Boolean).join(" ");
        return { kind: "Conference" as const, name: c.name, deadline: c.deadline as string, href: `${APP_URL}/conferences?view=tracking#c-${c.id}`, extra: steps };
      }),
      ...(grants.data ?? []).map((g) => ({ kind: "Grant" as const, name: g.name, deadline: g.deadline as string, href: `${APP_URL}/grants?view=tracking` })),
      ...(scholarships.data ?? []).map((s) => ({ kind: "Scholarship" as const, name: s.name, deadline: s.deadline as string, href: `${APP_URL}/scholarships` })),
    ],
  };
}
