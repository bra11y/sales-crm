"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { bookIdeas, learnProviders, splitText } from "@/lib/learn/ai";
import { BOOK_STATUSES, type BookStatus, FIELDS, type Field } from "@/lib/learn/books";
import type { Result } from "@/lib/learn/notes";
import { bookText } from "@/lib/learn/read-book";
import { firstReview } from "@/lib/learn/review";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ID = /^[0-9a-f-]{36}$/i;
const BOOK_TYPES = ["application/pdf", "application/epub+zip"];
const NO_SESSION = { ok: false as const, error: "You are signed out. Sign in again, then try once more." };
const field = (f: unknown): Field => (FIELDS.includes(f as Field) ? (f as Field) : "career");
const https = (u: unknown) => {
  try {
    const url = new URL(String(u ?? ""));
    return url.protocol === "https:" ? url.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
};

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

export async function saveCatalogBook(input: { title: string; author: string; url: string; cover: string | null; key: string; access: "free" | "borrow"; field: string }): Promise<Result<{ id: string }>> {
  const s = await session();
  if (!s) return NO_SESSION;
  const url = https(input.url);
  if (!url || !input.title?.trim()) return { ok: false, error: "That book has no link to read it." };
  const row = {
    user_id: s.userId,
    title: input.title.trim().slice(0, 200),
    author: String(input.author ?? "").slice(0, 200),
    url,
    cover: https(input.cover),
    catalog_key: String(input.key || url).slice(0, 1000),
    access: input.access === "borrow" ? "borrow" : "free",
    field: field(input.field),
  };
  const { data: had } = await s.db.from("books").select("id").eq("user_id", s.userId).eq("catalog_key", row.catalog_key).maybeSingle();
  if (had) return { ok: true, id: had.id };
  const { data, error } = await s.db.from("books").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: "The book could not be saved. Try again." };
  revalidatePath("/books");
  return { ok: true, id: data.id };
}

export async function addOwnBook(input: { path: string; title: string; author: string; mime: string; size: number; field: string }): Promise<Result<{ id: string }>> {
  const s = await session();
  if (!s) return NO_SESSION;
  if (!input.path.startsWith(`${s.userId}/`) || input.path.includes("..")) return { ok: false, error: "That file is not in your folder." };
  if (!BOOK_TYPES.includes(input.mime)) return { ok: false, error: "Use a PDF or EPUB file." };
  const title = input.title.trim().slice(0, 200);
  if (!title) return { ok: false, error: "Give the book a title." };
  const { data, error } = await s.db
    .from("books")
    .insert({ user_id: s.userId, title, author: input.author.trim().slice(0, 200), path: input.path, mime: input.mime, size_bytes: Math.round(input.size), field: field(input.field), status: "reading" })
    .select("id")
    .single();
  if (error || !data) {
    await s.db.storage.from("learning").remove([input.path]);
    return { ok: false, error: "The book uploaded but could not be saved to your list. Try again." };
  }
  revalidatePath("/books");
  return { ok: true, id: data.id };
}

export async function setBookStatus(id: string, status: BookStatus): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(id)) return NO_SESSION;
  if (!BOOK_STATUSES.includes(status)) return { ok: false, error: "Unknown reading status." };
  const { error } = await s.db.from("books").update({ status }).eq("id", id).eq("user_id", s.userId);
  if (error) return { ok: false, error: "The status could not be saved. Try again." };
  revalidatePath("/books");
  return { ok: true };
}

export async function deleteBook(id: string): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(id)) return NO_SESSION;
  const { data: b } = await s.db.from("books").select("path").eq("id", id).eq("user_id", s.userId).maybeSingle();
  if (!b) return { ok: false, error: "That book was not found." };
  const { error } = await s.db.from("books").delete().eq("id", id).eq("user_id", s.userId);
  if (error) return { ok: false, error: "The book could not be removed. Try again." };
  if (b.path) await s.db.storage.from("learning").remove([b.path]);
  revalidatePath("/books");
  return { ok: true };
}

// Opens your own book file for 10 minutes. Only you can make this link.
export async function openOwnBook(id: string): Promise<Result<{ url: string }>> {
  const s = await session();
  if (!s || !ID.test(id)) return NO_SESSION;
  const { data: b } = await s.db.from("books").select("path").eq("id", id).eq("user_id", s.userId).maybeSingle();
  if (!b?.path) return { ok: false, error: "That book has no file." };
  const { data, error } = await s.db.storage.from("learning").createSignedUrl(b.path, 600);
  if (error || !data) return { ok: false, error: "The book could not be opened. Try again." };
  return { ok: true, url: data.signedUrl };
}

// A summary saved as a note. Your own file: read from its text. A catalogue book: key ideas from
// the AI's general knowledge, marked as such.
export async function summariseBook(id: string): Promise<Result<{ noteId: string; steps: boolean }>> {
  const s = await session();
  if (!s || !ID.test(id)) return NO_SESSION;
  const { data: b } = await s.db.from("books").select("id, title, author, url, path, mime, field").eq("id", id).eq("user_id", s.userId).maybeSingle();
  if (!b) return { ok: false, error: "That book was not found." };
  const list = await providers(s.db, s.userId);
  if (!list.length) return { ok: false, error: "AI is off. Turn it on in your Profile to get a summary." };

  let transcript = "";
  let note: string | null = null;
  let ai = null;
  if (b.path && b.mime) {
    const { data: file, error } = await s.db.storage.from("learning").download(b.path);
    if (error || !file) return { ok: false, error: "The book file could not be read. Upload it again." };
    let text = "";
    try {
      text = (await bookText(await file.arrayBuffer(), b.mime)).text;
    } catch {
      return { ok: false, error: "The text could not be read from this file. If it is a scanned PDF, it has pictures of pages, not text." };
    }
    if (text.length < 1000) return { ok: false, error: "This file has almost no text to read. If it is a scanned PDF, it has pictures of pages, not text." };
    // Eight parts spread through the book: enough to summarise it, and light on a free AI key.
    const { parts, skipped } = splitText(text, 10_000, 8);
    transcript = parts.join("\n\n");
    if (skipped) note = `The book is long, so ${parts.length} parts spread through it were read and ${skipped} were skipped. Read the whole book for the full picture.`;
  } else {
    const r = await bookIdeas(b.title, b.author, b.field, list);
    if (!r.ok) return { ok: false, error: r.error };
    ai = r.ai;
    note = "These key ideas come from the AI's general knowledge of the book, not from its text. Check them as you read.";
  }
  const steps = Boolean(transcript);

  const { data: old } = await s.db.from("notes").select("id").eq("user_id", s.userId).eq("book_id", b.id).maybeSingle();
  const now = new Date().toISOString();
  if (old) {
    await s.db.from("notes").update({ ...(ai ? { ai } : {}), ai_note: note, ...(transcript ? { transcript, transcript_from: "book" } : {}), updated_at: now }).eq("id", old.id).eq("user_id", s.userId);
    revalidatePath("/books");
    return { ok: true, noteId: old.id, steps };
  }
  const review = firstReview();
  const { data: made, error } = await s.db
    .from("notes")
    .insert({
      user_id: s.userId,
      kind: "book",
      title: b.title,
      author: b.author,
      source_url: b.url,
      book_id: b.id,
      transcript,
      transcript_from: transcript ? "book" : null,
      ai,
      ai_note: note,
      tags: [b.field],
      review_step: review.step,
      review_due: review.due,
    })
    .select("id")
    .single();
  if (error || !made) return { ok: false, error: "The summary was written but could not be saved. Try again." };
  revalidatePath("/books");
  revalidatePath("/notes");
  return { ok: true, noteId: made.id, steps };
}
