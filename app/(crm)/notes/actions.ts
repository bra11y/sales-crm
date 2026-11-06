"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { learnProviders } from "@/lib/learn/ai";
import { cleanTags, MAX_TRANSCRIPT, type Result, saveText, saveVideo, summaryFinish, summaryPart, summaryPlan, whisper } from "@/lib/learn/notes";
import { firstReview, nextReview } from "@/lib/learn/review";
import { cleanTranscript, videoId } from "@/lib/learn/youtube";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ID = /^[0-9a-f-]{36}$/i;
const NO_SESSION = { ok: false as const, error: "You are signed out. Sign in again, then try once more." };

async function session() {
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getUser();
  return data.user ? { db, userId: data.user.id } : null;
}

async function providers(db: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const profile = await loadProfile(db, userId);
  if (profile?.preferences.ai === "off") return [];
  return learnProviders(process.env, (await headers()).get("x-vercel-oidc-token"));
}

// Saving is quick. The summary is written afterwards on the note's page, step by step.
export async function addVideoNote(input: { url: string; transcript?: string; body?: string; tags?: string }): Promise<Result<{ id: string; existed: boolean; summarise: boolean }>> {
  const s = await session();
  if (!s) return NO_SESSION;
  const r = await saveVideo(s.db, s.userId, { ...input, from: "pasted" });
  if (!r.ok) return r;
  revalidatePath("/notes");
  return { ok: true, id: r.id, existed: r.existed, summarise: Boolean(input.transcript?.trim() || input.body?.trim()) };
}

export async function addTextNote(input: { title: string; body: string; url?: string; tags?: string }): Promise<Result<{ id: string; summarise: boolean }>> {
  const s = await session();
  if (!s) return NO_SESSION;
  const r = await saveText(s.db, s.userId, input);
  if (!r.ok) return r;
  revalidatePath("/notes");
  return { ok: true, id: r.id, summarise: true };
}

// A file you uploaded to your private folder: Whisper writes its words, then the file is deleted.
export async function addFileNote(input: { path: string; name: string; title?: string; url?: string; tags?: string }): Promise<Result<{ id: string; summarise: boolean }>> {
  const s = await session();
  if (!s) return NO_SESSION;
  if (!input.path.startsWith(`${s.userId}/`) || input.path.includes("..")) return { ok: false, error: "That file is not in your folder." };
  const { data: file, error } = await s.db.storage.from("learning").download(input.path);
  if (error || !file) return { ok: false, error: "The uploaded file could not be read. Upload it again." };
  const heard = await whisper(file, input.name || "audio", process.env);
  await s.db.storage.from("learning").remove([input.path]);
  if (!heard.ok) return heard;

  let id: string;
  if (input.url && videoId(input.url)) {
    const r = await saveVideo(s.db, s.userId, { url: input.url, transcript: heard.text, tags: input.tags, from: "pasted" });
    if (!r.ok) return r;
    id = r.id;
    await s.db.from("notes").update({ transcript_from: "whisper" }).eq("id", id).eq("user_id", s.userId);
  } else {
    const title = (input.title?.trim() || input.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ")).slice(0, 300) || "Recording";
    const review = firstReview();
    const { data, error: insertError } = await s.db
      .from("notes")
      .insert({ user_id: s.userId, kind: "video", title, transcript: heard.text.slice(0, MAX_TRANSCRIPT), transcript_from: "whisper", tags: cleanTags(input.tags), review_step: review.step, review_due: review.due })
      .select("id")
      .single();
    if (insertError || !data) return { ok: false, error: "The words were written but the note could not be saved. Try again." };
    id = data.id;
  }
  revalidatePath("/notes");
  return { ok: true, id, summarise: true };
}

export async function addTranscript(noteId: string, transcript: string): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(noteId)) return NO_SESSION;
  const words = cleanTranscript(transcript).slice(0, MAX_TRANSCRIPT);
  if (words.length < 200) return { ok: false, error: "That is too little text. Paste the whole transcript from YouTube's Show transcript panel." };
  const { error } = await s.db.from("notes").update({ transcript: words, transcript_from: "pasted", updated_at: new Date().toISOString() }).eq("id", noteId).eq("user_id", s.userId);
  if (error) return { ok: false, error: "The transcript could not be saved. Try again." };
  return { ok: true };
}

export async function planSummary(noteId: string): Promise<Result<{ parts: number }>> {
  const s = await session();
  if (!s || !ID.test(noteId)) return NO_SESSION;
  return summaryPlan(s.db, s.userId, noteId, await providers(s.db, s.userId));
}

export async function summarisePart(noteId: string, index: number): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(noteId)) return NO_SESSION;
  return summaryPart(s.db, s.userId, noteId, index, await providers(s.db, s.userId));
}

export async function finishSummary(noteId: string): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(noteId)) return NO_SESSION;
  const r = await summaryFinish(s.db, s.userId, noteId, await providers(s.db, s.userId));
  revalidatePath("/notes");
  return r;
}

export async function updateNote(noteId: string, input: { title: string; body: string; tags: string }): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(noteId)) return NO_SESSION;
  const title = input.title.trim().slice(0, 300);
  if (!title) return { ok: false, error: "The note needs a title." };
  const { error } = await s.db
    .from("notes")
    .update({ title, body: input.body.slice(0, 50_000), tags: cleanTags(input.tags), updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("user_id", s.userId);
  if (error) return { ok: false, error: "Your changes could not be saved. Try again." };
  revalidatePath("/notes");
  return { ok: true };
}

export async function reviewNote(noteId: string, result: "remembered" | "again"): Promise<Result<{ due: string | null }>> {
  const s = await session();
  if (!s || !ID.test(noteId)) return NO_SESSION;
  const { data: n } = await s.db.from("notes").select("review_step").eq("id", noteId).eq("user_id", s.userId).maybeSingle();
  if (!n) return { ok: false, error: "That note was not found." };
  const next = nextReview(n.review_step, result === "again" ? "again" : "remembered");
  const { error } = await s.db.from("notes").update({ review_step: next.step, review_due: next.due }).eq("id", noteId).eq("user_id", s.userId);
  if (error) return { ok: false, error: "The review could not be saved. Try again." };
  revalidatePath("/notes");
  return { ok: true, due: next.due };
}

export async function deleteNote(noteId: string): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(noteId)) return NO_SESSION;
  const { error } = await s.db.from("notes").delete().eq("id", noteId).eq("user_id", s.userId);
  if (error) return { ok: false, error: "The note could not be deleted. Try again." };
  revalidatePath("/notes");
  return { ok: true };
}
