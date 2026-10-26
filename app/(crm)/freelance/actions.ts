"use server";

import { revalidatePath } from "next/cache";
import { loadLogin } from "@/lib/apply/outbox";
import { auditHtml, type Finding } from "@/lib/audit/check";
import { fetchPage, siteUrl } from "@/lib/audit/fetch";
import { pitch } from "@/lib/audit/pitch";
import { currentUserId, loadProfile } from "@/lib/jobs/profile";
import { saveDraft } from "@/lib/mail/gmail";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { ok: true; note?: string; text?: string } | { ok: false; error: string };
const PER_HOUR = 40;
const STATUSES = ["checked", "drafted", "sent", "replied", "won", "not_now"];

// Checks a company's site and saves what it found. Checking again updates the same row.
export async function checkSite(input: { company: string; url: string; contactName?: string; contactEmail?: string }): Promise<Result> {
  const company = input.company.trim().slice(0, 200);
  const u = siteUrl(input.url);
  if (!company) return { ok: false, error: "Enter the company's name." };
  if (!u) return { ok: false, error: "Enter the company's website, like acme.com." };
  const email = (input.contactEmail ?? "").trim().slice(0, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email address does not look right." };
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("audit_prospects")
    .select("id", { count: "exact", head: true })
    .gte("checked_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= PER_HOUR) return { ok: false, error: `You checked ${PER_HOUR} sites this hour. Try again later.` };
  const page = await fetchPage(u);
  if (!page.ok) return { ok: false, error: page.error };
  const a = auditHtml(page.html);
  // Checking a site again updates its row; the address itself never changes.
  const fields = {
    company,
    contact_name: input.contactName?.trim().slice(0, 120) || null,
    contact_email: email || null,
    score: a.score,
    findings: a.findings,
    checked_at: new Date().toISOString(),
  };
  const { data: had } = await supabase.from("audit_prospects").select("id").eq("url", u.toString()).maybeSingle();
  const { error } = had ? await supabase.from("audit_prospects").update(fields).eq("id", had.id) : await supabase.from("audit_prospects").insert({ ...fields, url: u.toString() });
  if (error) return { ok: false, error: "The check ran but could not be saved. Try again." };
  revalidatePath("/freelance");
  return {
    ok: true,
    note: a.findings.length
      ? `${company}: ${a.findings.length} problem${a.findings.length === 1 ? "" : "s"} found, score ${a.score} of 100.`
      : `${company}: nothing a quick check can find. A real audit may still find problems.`,
  };
}

// Writes the cold email into your Gmail Drafts. Without Gmail, you get the text to copy.
export async function draftOutreach(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: p } = await supabase.from("audit_prospects").select("company, url, contact_name, contact_email, findings").eq("id", id).maybeSingle();
  if (!p) return { ok: false, error: "That company was not found. Reload the page." };
  const findings = (p.findings ?? []) as Finding[];
  if (!findings.length) return { ok: false, error: "The quick check found nothing to mention, so there is no email to write." };
  const userId = await currentUserId();
  const admin = createSupabaseAdminClient();
  const profile = await loadProfile();
  if (!userId || !admin || !profile) return { ok: false, error: "Sign in again." };
  const person = profile.facts.person;
  const mail = pitch(p.company, p.url, findings, { name: person.name ?? "", brand: person.brand, portfolio: person.portfolio, cpacc: person.cpacc }, p.contact_name ?? "");
  const login = await loadLogin(admin, userId, person.name);
  const text = `To: ${p.contact_email ?? ""}\nSubject: ${mail.subject}\n\n${mail.body}`;
  if (!login) return { ok: true, note: "Gmail is not connected, so here is the email to copy.", text };
  try {
    await saveDraft(login, { to: p.contact_email ?? "", subject: mail.subject, text: mail.body });
  } catch {
    return { ok: true, note: "Gmail did not take the draft. Here is the email to copy.", text };
  }
  await supabase.from("audit_prospects").update({ status: "drafted", drafted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/freelance");
  return { ok: true, note: `Saved in your Gmail Drafts${p.contact_email ? ` to ${p.contact_email}` : ". Add their address there"}. Read it, then send it yourself.`, text };
}

export async function setProspectStatus(id: string, status: string): Promise<Result> {
  if (!STATUSES.includes(status)) return { ok: false, error: "Pick one of the listed stages." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("audit_prospects").update({ status }).eq("id", id);
  if (error) return { ok: false, error: "That change was not saved." };
  revalidatePath("/freelance");
  return { ok: true };
}

export async function removeProspect(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("audit_prospects").delete().eq("id", id);
  if (error) return { ok: false, error: "It could not be removed." };
  revalidatePath("/freelance");
  return { ok: true };
}
