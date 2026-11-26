"use server";

import { headers } from "next/headers";
import { aiProviders } from "@/lib/apply/ai";
import { type Coached, coachPrompt, dropInvented, dropUnaskedClaims, readCoached, TOOLS, type ToolId, WRITES_ABOUT_YOU } from "@/lib/coach/coach";
import { profileBrief } from "@/lib/conferences/answers";
import { askJson } from "@/lib/learn/ai";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Input = { jobId?: string; jobText?: string; role?: string; question?: string; answer?: string };
export type CoachResult = { ok: true; coached: Coached; note: string } | { ok: false; error: string; field?: "job" | "role" | "answer" };

export async function runCoach(tool: ToolId, input: Input): Promise<CoachResult> {
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, error: "You are signed out. Sign in again, then try once more." };
  const def = TOOLS.find((t) => t.id === tool) ?? (tool === "feedback" ? { needs: "answer" as const } : null);
  if (!def) return { ok: false, error: "That tool does not exist." };

  let job = (input.jobText ?? "").trim().slice(0, 8000);
  if (input.jobId && /^[0-9a-f-]{36}$/i.test(input.jobId)) {
    const { data } = await db.from("job_posts").select("title, company, description").eq("id", input.jobId).eq("user_id", auth.user.id).maybeSingle();
    if (data) job = `${data.title} at ${data.company}\n\n${data.description ?? ""}`.slice(0, 8000);
  }
  const role = (input.role ?? "").trim().slice(0, 120);
  if ((def.needs === "job" || tool === "feedback") && job.length < 80) return { ok: false, error: "Choose a saved job or paste the job post (at least a few lines).", field: "job" };
  if (def.needs === "role" && !role) return { ok: false, error: "Type the role you are aiming for, like Accessibility Specialist.", field: "role" };
  if (tool === "feedback" && (input.answer ?? "").trim().split(/\s+/).length < 15) return { ok: false, error: "Write a fuller answer first: at least two or three sentences.", field: "answer" };

  const profile = await loadProfile(db, auth.user.id);
  if (!profile) return { ok: false, error: "Fill in your Profile first, so the coach knows your work." };
  if (profile.preferences.ai === "off") return { ok: false, error: "AI is off in Settings. Turn it on to use the coach." };
  const brief = profileBrief(profile.facts);
  const { system, user } = coachPrompt(tool, { profile: brief, job, role, question: input.question?.slice(0, 500), answer: input.answer?.slice(0, 4000) });
  const r = await askJson(aiProviders(process.env, (await headers()).get("x-vercel-oidc-token")), system, user, readCoached, 3500);
  if (!r.ok) return { ok: false, error: `The coach could not answer: ${r.error}` };
  if (!WRITES_ABOUT_YOU.includes(tool)) return { ok: true, coached: r.value, note: `Written by ${r.provider}.` };
  const known = [brief, job, input.answer ?? "", JSON.stringify(profile.facts)].join(" ");
  const numbers = dropInvented(r.value, known);
  const claims = dropUnaskedClaims(numbers.coached, known);
  const coached = claims.coached;
  const dropped = numbers.dropped + claims.dropped;
  return { ok: true, coached, note: `Written by ${r.provider}.${dropped ? ` ${dropped} ${dropped === 1 ? "line was" : "lines were"} removed for stating something your Profile does not show.` : ""} Add only what is true.` };
}
