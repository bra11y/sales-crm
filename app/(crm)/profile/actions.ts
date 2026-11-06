"use server";

import { cleanFacts, type StoredFacts } from "@/lib/jobs/facts";
import { cleanPreferences, type Preferences } from "@/lib/jobs/preferences";
import { loadProfile } from "@/lib/jobs/profile";
import { rescoreSaved } from "@/lib/jobs/search";
import { createExtensionToken } from "@/lib/apply/kit";
import { connectGmail, sendTestEmail } from "@/lib/apply/outbox";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { backedBy, cvPrompt, mergeCv, readCv } from "@/lib/jobs/cv-import";
import { askJson, learnProviders } from "@/lib/learn/ai";
import { bookText } from "@/lib/learn/read-book";
import { htmlToText } from "@/lib/jobs/text";

export async function saveProfile(input: { facts: StoredFacts; preferences: Preferences }): Promise<{ ok: true; savedAt: string } | { ok: false; error: string }> {
  if (JSON.stringify(input ?? {}).length > 300_000) return { ok: false, error: "Your profile is too long to save. Shorten some sections." };
  const supabase = await createSupabaseServerClient();
  const current = await loadProfile(supabase);
  if (!current) return { ok: false, error: "Sign in again to save your profile." };

  const facts = cleanFacts(input.facts, current.stored);
  const preferences = cleanPreferences(input.preferences);
  const savedAt = new Date().toISOString();
  const { error } = await supabase.from("job_profiles").update({ facts, preferences, updated_at: savedAt }).eq("user_id", current.userId);
  if (error) return { ok: false, error: "Your changes were not saved. Check your connection and try again." };
  // Score your saved jobs again, so a new level or pay floor shows straight away.
  const admin = createSupabaseAdminClient();
  const fresh = admin ? await loadProfile(admin, current.userId) : null;
  if (admin && fresh) await rescoreSaved(admin, current.userId, fresh).catch(() => 0);
  return { ok: true, savedAt };
}

async function mailUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const admin = createSupabaseAdminClient();
  return data.user && admin ? { userId: data.user.id, admin } : null;
}

export async function connectMail(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again to connect Gmail." };
  const r = await connectGmail(s.admin, s.userId, String(email ?? "").slice(0, 200), String(password ?? "").slice(0, 100));
  return r.ok ? { ok: true } : r;
}

export async function sendMailTest(): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again." };
  return sendTestEmail(s.admin, s.userId);
}

export async function disconnectMail(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again." };
  await s.admin.from("applications_outbox").update({ status: "cancelled", error: "Gmail was disconnected." }).eq("user_id", s.userId).eq("status", "queued");
  const { error } = await s.admin.from("mail_accounts").delete().eq("user_id", s.userId);
  return error ? { ok: false, error: "Gmail could not be disconnected. Try again." } : { ok: true };
}

export async function makeExtensionCode(): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again." };
  return { ok: true, code: await createExtensionToken(s.admin, s.userId) };
}

export async function revokeExtensionCode(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await mailUser();
  if (!s) return { ok: false, error: "Sign in again." };
  const { error } = await s.admin.from("extension_tokens").delete().eq("user_id", s.userId);
  return error ? { ok: false, error: "The code could not be turned off. Try again." } : { ok: true };
}

// Set up or add to your Profile from your own CV: a file already in your Documents, or pasted text.
// A public web page's text, for a portfolio link. Only https, only public hosts, small pages.
async function pageText(link: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || host === "localhost" || /^(\d+\.){3}\d+$/.test(host) || host.includes(":") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/linkedin\.com$/.test(host)) return null;
  try {
    const res = await fetch(u, { headers: { "user-agent": "SalesCRM-Profile/1.0", accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    if (!res.ok || !/text\/html|text\/plain/.test(res.headers.get("content-type") ?? "")) return null;
    const html = (await res.text()).slice(0, 400_000);
    return htmlToText(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " "));
  } catch {
    return null;
  }
}

export async function importCv(input: { path?: string; mime?: string; text?: string; link?: string }): Promise<{ ok: true; added: string[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const current = await loadProfile(supabase);
  if (!current) return { ok: false, error: "Sign in again to set up your profile." };
  let cv = String(input.text ?? "").slice(0, 60_000);
  if (input.path) {
    if (!input.path.startsWith(`${current.userId}/`) || input.path.includes("..")) return { ok: false, error: "That file is not in your folder." };
    const { data: file, error } = await supabase.storage.from("documents").download(input.path);
    if (error || !file) return { ok: false, error: "Your CV could not be opened. Upload it again." };
    try {
      cv = (await bookText(await file.arrayBuffer(), input.mime ?? "")).text;
    } catch {
      return { ok: false, error: "Use a PDF or Word (.docx) file, or paste the text of your CV." };
    }
  }
  if (input.link?.trim()) {
    if (/linkedin\.com/i.test(input.link)) return { ok: false, error: "LinkedIn pages need you to be signed in, so they can't be read from here. On LinkedIn, open your profile, press More, then Save to PDF, and drop that file in instead." };
    const page = await pageText(input.link.trim());
    if (!page) return { ok: false, error: "That page could not be read. Check the link starts with https:// and opens without signing in." };
    cv = `${cv}\n\n${page}`.slice(0, 60_000);
  }
  if (cv.trim().length < 200) return { ok: false, error: "There is too little text to read. If your CV is a scanned image, paste its text instead." };
  const providers = current.preferences.ai === "off" ? [] : learnProviders(process.env, (await headers()).get("x-vercel-oidc-token"));
  const { system, user } = cvPrompt(cv, current.stored);
  const r = await askJson(providers, system, user, (v) => readCv(v, cv, Object.keys(current.stored.tracks)), 4000);
  if (!r.ok) return { ok: false, error: `Your CV could not be read just now (${r.error}). Try again in a minute.` };
  const { facts, added } = mergeCv(current.stored, r.value);
  // The job titles to search for come from the CV when you have not chosen any yet.
  const titles = !current.preferences.titles.length && r.value.targets.length ? r.value.targets : null;
  if (titles) added.push(`job titles to search for (${titles.join(", ")})`);
  if (!added.length) return { ok: true, added: [] };
  const { error } = await supabase
    .from("job_profiles")
    .update({ facts: cleanFacts(facts, current.stored), ...(titles ? { preferences: cleanPreferences({ ...current.preferences, titles }) } : {}), updated_at: new Date().toISOString() })
    .eq("user_id", current.userId);
  if (error) return { ok: false, error: "Your CV was read but your profile could not be saved. Try again." };
  return { ok: true, added };
}

// Writes the summary, letter opening and story for one kind of job, from your own Profile only.
// Any number that is not in your Profile is a reason to drop the draft.
export async function writeSummary(trackId: string): Promise<{ ok: true; profile: string; hook: string; story: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const current = await loadProfile(supabase);
  if (!current) return { ok: false, error: "Sign in again, then try once more." };
  const track = current.stored.tracks[trackId];
  if (!track) return { ok: false, error: "That kind of job was not found." };
  const f = current.stored;
  const mine = [
    `Name: ${f.person.name}`,
    `Job titles wanted: ${current.preferences.titles.join(", ") || track.label}`,
    `Skills: ${f.skills.flatMap((g) => g.items.map((i) => i.label)).join(", ")}`,
    ...f.jobs.map((j) => `Job: ${Object.values(j.title)[0]} at ${j.org} (${j.dates})\n${j.bullets.map((b) => `- ${b.text}`).join("\n")}`),
    `Projects: ${f.projects.map((p) => p.text).join("; ")}`,
    `Certifications: ${f.certifications.join("; ")}`,
    `Education: ${f.education.degree} ${f.education.school}`,
  ].join("\n");
  if (mine.replace(/[^a-z]/gi, "").length < 120) return { ok: false, error: "Add your skills and at least one job first, or set up your Profile from your CV." };
  const providers = current.preferences.ai === "off" ? [] : learnProviders(process.env, (await headers()).get("x-vercel-oidc-token"));
  const system = [
    `You write the top of a CV and the opening of cover letters for someone applying for ${trackId === "general" ? current.preferences.titles.join(" or ") || "their field" : track.label} jobs.`,
    "Use only facts in their profile. Never add a number, employer, tool or result that is not there.",
    "Plain English, first person, active voice. No em dashes. Never use: passionate, results-driven, dynamic, leverage, seamless, robust, synergy, hard-working, team player.",
    'Reply with JSON only: {"profile":"2 to 3 sentences: who they are, their strongest true result, what they do best","hook":"one sentence with their strongest true results","story":"2 sentences: one real example from their jobs, with its result"}',
  ].join("\n");
  const r = await askJson(providers, system, `Their profile:\n${mine}`, (v) => {
    const clean = (x: unknown, n: number) => String(x ?? "").replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, n);
    const out = { profile: clean(v.profile, 900), hook: clean(v.hook, 400), story: clean(v.story, 600) };
    return out.profile && backedBy(`${out.profile} ${out.hook} ${out.story}`, mine) ? out : null;
  }, 1200);
  return r.ok ? { ok: true, ...r.value } : { ok: false, error: `It could not be written just now (${r.error}). Try again in a minute.` };
}
