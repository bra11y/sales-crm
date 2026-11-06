// Saving notes and making their AI parts. Used by the Notes page and by the extension, so both
// follow the same rules. `db` is the signed-in person's client, or the admin client with their id.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provider } from "../apply/ai.ts";
import { finalNote, joinParts, makeNote, type NoteAi, partNotes, type Source, splitText } from "./ai.ts";
import { firstReview } from "./review.ts";
import { cleanTranscript, videoId, videoInfo } from "./youtube.ts";

export type Note = {
  id: string;
  kind: "video" | "text" | "book";
  title: string;
  author: string;
  source_url: string | null;
  thumbnail: string | null;
  video_id: string | null;
  book_id: string | null;
  transcript: string;
  transcript_from: "pasted" | "extension" | "whisper" | "book" | "typed" | null;
  body: string;
  ai: NoteAi | null;
  ai_note: string | null;
  tags: string[];
  review_step: number;
  review_due: string | null;
  created_at: string;
  updated_at: string;
};
export const NOTE_COLS = "id, kind, title, author, source_url, thumbnail, video_id, book_id, transcript, transcript_from, body, ai, ai_note, tags, review_step, review_due, created_at, updated_at";
export const NOTE_LIST_COLS = "id, kind, title, author, source_url, thumbnail, video_id, book_id, transcript_from, body, ai, ai_note, tags, review_step, review_due, created_at, updated_at";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Fetcher = typeof fetch;

export const MAX_TRANSCRIPT = 400_000;

export function cleanTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(",");
  return [...new Set(raw.map((t) => String(t).trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 30)).filter(Boolean))].slice(0, 12);
}

// The AI part for a note, from its transcript and your own words. Never fails the save: when
// AI is off or busy, the note keeps your words and says why there is no summary.
export async function fillAi(db: SupabaseClient, userId: string, noteId: string, providers: Provider[], fetcher: Fetcher = fetch): Promise<Result<{ note: string | null }>> {
  const { data: n } = await db.from("notes").select("kind, title, author, transcript, body").eq("id", noteId).eq("user_id", userId).maybeSingle();
  if (!n) return { ok: false, error: "That note was not found." };
  const source: Source = { kind: n.kind, title: n.title, by: n.author };
  const text = [n.transcript, n.body && `My own notes:\n${n.body}`].filter(Boolean).join("\n\n");
  const r = await makeNote(source, text, providers, fetcher);
  const now = new Date().toISOString();
  if (!r.ok) {
    await db.from("notes").update({ ai_note: r.error.slice(0, 1000), updated_at: now }).eq("id", noteId).eq("user_id", userId);
    return { ok: true, note: r.error };
  }
  const note = r.skipped ? `The source was very long, so ${r.parts} parts spread through it were read and ${r.skipped} were skipped.` : null;
  await db.from("notes").update({ ai: r.ai, ai_note: note, updated_at: now }).eq("id", noteId).eq("user_id", userId);
  return { ok: true, note };
}

// The summary in steps, so no single request runs long and the page can show progress:
// plan (how many parts), one call per part, then finish.
async function sourceOf(db: SupabaseClient, userId: string, noteId: string) {
  const { data: n } = await db.from("notes").select("kind, title, author, transcript, body, part_notes").eq("id", noteId).eq("user_id", userId).maybeSingle();
  if (!n) return null;
  const text = [n.transcript, n.body && `My own notes:\n${n.body}`].filter(Boolean).join("\n\n");
  const source: Source = { kind: n.kind, title: n.title, by: n.author };
  return { source, text, split: splitText(text), partNotes: (Array.isArray(n.part_notes) ? n.part_notes : []) as string[][] };
}

export async function summaryPlan(db: SupabaseClient, userId: string, noteId: string, providers: Provider[]): Promise<Result<{ parts: number }>> {
  if (!providers.length) return { ok: false, error: "AI is off, so only your own words are kept. Turn AI on in your Profile to get a summary and post drafts." };
  const n = await sourceOf(db, userId, noteId);
  if (!n) return { ok: false, error: "That note was not found." };
  if (n.text.trim().length < 200) return { ok: false, error: "There is too little text to summarise. Add the full transcript or more of your own notes." };
  await db.from("notes").update({ part_notes: [] }).eq("id", noteId).eq("user_id", userId);
  return { ok: true, parts: n.split.parts.length };
}

export async function summaryPart(db: SupabaseClient, userId: string, noteId: string, index: number, providers: Provider[], fetcher: Fetcher = fetch): Promise<Result> {
  const n = await sourceOf(db, userId, noteId);
  if (!n) return { ok: false, error: "That note was not found." };
  const { parts } = n.split;
  if (!Number.isInteger(index) || index < 0 || index >= parts.length) return { ok: false, error: "That part does not exist." };
  if (parts.length === 1) return { ok: true };
  const r = await partNotes(n.source, parts[index], index + 1, parts.length, providers, fetcher);
  if (!r.ok) return r;
  const all = [...n.partNotes];
  all[index] = r.points;
  await db.from("notes").update({ part_notes: all }).eq("id", noteId).eq("user_id", userId);
  return { ok: true };
}

export async function summaryFinish(db: SupabaseClient, userId: string, noteId: string, providers: Provider[], fetcher: Fetcher = fetch): Promise<Result> {
  const n = await sourceOf(db, userId, noteId);
  if (!n) return { ok: false, error: "That note was not found." };
  const { parts, skipped } = n.split;
  const long = parts.length > 1;
  if (long && (n.partNotes.length < parts.length || n.partNotes.some((p) => !p?.length))) return { ok: false, error: "Some parts were not read yet. Press the button to try again." };
  const r = await finalNote(n.source, long ? joinParts(n.partNotes) : parts[0], long, providers, fetcher);
  if (!r.ok) return r;
  const note = skipped ? `The source was very long, so ${parts.length} parts spread through it were read and ${skipped} were skipped.` : null;
  const { data: old } = await db.from("notes").select("ai_note").eq("id", noteId).eq("user_id", userId).maybeSingle();
  // A warning saved with the note (like "from a book") stays; a past error does not.
  const keep = old?.ai_note && /^(These key ideas|The book is long)/.test(old.ai_note) ? old.ai_note : note;
  await db.from("notes").update({ ai: r.ai, ai_note: keep, part_notes: null, updated_at: new Date().toISOString() }).eq("id", noteId).eq("user_id", userId);
  return { ok: true };
}

export type VideoInput = { url: string; transcript?: string; body?: string; tags?: unknown; from?: "pasted" | "extension" };

// A YouTube video: title and thumbnail from oEmbed; the words from what you pasted or what the
// extension read in your browser. Saving the same video again adds the new words to it.
export async function saveVideo(db: SupabaseClient, userId: string, input: VideoInput, fetcher: Fetcher = fetch): Promise<Result<{ id: string; existed: boolean }>> {
  const id = videoId(input.url ?? "");
  if (!id) return { ok: false, error: "That is not a YouTube link. Copy the link from the Share button or the address bar." };
  const transcript = cleanTranscript(String(input.transcript ?? "")).slice(0, MAX_TRANSCRIPT);
  const body = String(input.body ?? "").trim().slice(0, 50_000);
  const tags = cleanTags(input.tags);
  const now = new Date().toISOString();

  const { data: old } = await db.from("notes").select("id, transcript, body, tags").eq("user_id", userId).eq("video_id", id).maybeSingle();
  if (old) {
    const patch: Record<string, unknown> = { updated_at: now };
    if (transcript && transcript.length > old.transcript.length) Object.assign(patch, { transcript, transcript_from: input.from ?? "pasted" });
    if (body) patch.body = old.body ? `${old.body}\n\n${body}` : body;
    if (tags.length) patch.tags = cleanTags([...old.tags, ...tags]);
    await db.from("notes").update(patch).eq("id", old.id).eq("user_id", userId);
    return { ok: true, id: old.id, existed: true };
  }

  const info = await videoInfo(id, fetcher);
  const review = firstReview();
  const { data, error } = await db
    .from("notes")
    .insert({
      user_id: userId,
      kind: "video",
      title: info.title,
      author: info.channel,
      source_url: info.url,
      thumbnail: info.thumbnail,
      video_id: id,
      transcript,
      transcript_from: transcript ? (input.from ?? "pasted") : null,
      body,
      tags,
      review_step: review.step,
      review_due: review.due,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "The note could not be saved. Try again." };
  return { ok: true, id: data.id, existed: false };
}

export async function saveText(db: SupabaseClient, userId: string, input: { title?: string; body?: string; url?: string; tags?: unknown }): Promise<Result<{ id: string }>> {
  const title = String(input.title ?? "").trim().slice(0, 300);
  const body = String(input.body ?? "").trim().slice(0, 50_000);
  if (!title) return { ok: false, error: "Give the note a title." };
  if (!body) return { ok: false, error: "Write or paste something in the note." };
  let url: string | null = null;
  if (input.url?.trim()) {
    try {
      const u = new URL(input.url.trim());
      if (u.protocol !== "https:") return { ok: false, error: "The link must start with https://" };
      url = u.toString().slice(0, 1000);
    } catch {
      return { ok: false, error: "That link is not a web address. Leave it empty or paste the full address." };
    }
  }
  const review = firstReview();
  const { data, error } = await db
    .from("notes")
    .insert({ user_id: userId, kind: "text", title, body, source_url: url, transcript_from: "typed", tags: cleanTags(input.tags), review_step: review.step, review_due: review.due })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "The note could not be saved. Try again." };
  return { ok: true, id: data.id };
}

// Groq's Whisper writes the words of an audio or video file you uploaded.
export async function whisper(file: Blob, name: string, env: Record<string, string | undefined>, fetcher: Fetcher = fetch): Promise<Result<{ text: string }>> {
  const base = env.FREE_AI_BASE_URL ?? "";
  if (!/groq\.com/.test(base) || !env.FREE_AI_API_KEY) return { ok: false, error: "Turning speech into text needs the Groq key, which is not set up." };
  const form = new FormData();
  form.append("file", file, name);
  form.append("model", env.WHISPER_MODEL || "whisper-large-v3-turbo");
  form.append("response_format", "text");
  const res = await fetcher(`${base.replace(/\/$/, "")}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${env.FREE_AI_API_KEY}` }, body: form, signal: AbortSignal.timeout(240_000) });
  if (res.status === 413) return { ok: false, error: "That file is too big for speech to text. Use a file under 25 MB, or save just the audio." };
  if (!res.ok) return { ok: false, error: `Speech to text did not work (Groq answered ${res.status}). Try again in a minute.` };
  const text = (await res.text()).trim();
  return text ? { ok: true, text } : { ok: false, error: "No speech was found in that file." };
}
