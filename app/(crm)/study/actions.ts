"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { aiProviders } from "@/lib/apply/ai";
import { firstReview } from "@/lib/learn/review";
import { dayKey } from "@/lib/motivation";
import { type DailyPost, preparePost } from "@/lib/social/post";
import { findTopic, type Lesson, topicsFor, writeLesson } from "@/lib/study/topics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type R<T> = ({ ok: true } & T) | { ok: false; error: string };

async function signedIn() {
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getUser();
  return data.user ? { db, userId: data.user.id } : null;
}

// Writes a topic's lesson now, when it is not one of today's or the morning run missed it.
export async function studyNow(slug: string): Promise<R<{ lesson: Lesson }>> {
  const s = await signedIn();
  if (!s) return { ok: false, error: "You are signed out. Sign in again, then try once more." };
  const topic = findTopic(slug);
  if (!topic) return { ok: false, error: "That topic is not on the list." };
  const { data } = await s.db.from("study_lessons").select("lesson").eq("slug", slug).maybeSingle();
  if (data) return { ok: true, lesson: data.lesson as Lesson };
  const lesson = await writeLesson(topic, aiProviders(process.env, (await headers()).get("x-vercel-oidc-token")));
  if (!lesson) return { ok: false, error: "The lesson could not be written. Try again in a minute." };
  const admin = createSupabaseAdminClient();
  if (admin) await admin.from("study_lessons").upsert({ slug, lesson }, { onConflict: "slug" });
  revalidatePath("/study");
  return { ok: true, lesson };
}

// Saves a lesson as a note, so it comes back for review like your other notes.
export async function saveStudyNote(slug: string): Promise<R<{ noteId: string }>> {
  const s = await signedIn();
  if (!s) return { ok: false, error: "You are signed out. Sign in again, then try once more." };
  const topic = findTopic(slug);
  const { data } = await s.db.from("study_lessons").select("lesson").eq("slug", slug).maybeSingle();
  if (!topic || !data) return { ok: false, error: "Open the lesson first, then save it." };
  const l = data.lesson as Lesson;
  const review = firstReview();
  const { data: note, error } = await s.db
    .from("notes")
    .insert({
      user_id: s.userId,
      kind: "text",
      title: `${topic.name} (${topic.category})`,
      transcript: [l.explain, l.example, l.use].join("\n\n"),
      transcript_from: "typed",
      ai: { summary: l.explain, points: [l.example, l.use], questions: l.question ? [l.question] : [], posts: [], ideas: [], projects: [], flow: l.flow, provider: l.from, at: new Date().toISOString() },
      tags: ["study", topic.categoryId],
      review_step: review.step,
      review_due: review.due,
    })
    .select("id")
    .single();
  if (error || !note) return { ok: false, error: "The note could not be saved. Try again." };
  revalidatePath("/notes");
  return { ok: true, noteId: note.id };
}

// Writes today's X post now, when the morning run has not.
export async function postNow(): Promise<R<{ post: DailyPost }>> {
  const s = await signedIn();
  if (!s) return { ok: false, error: "You are signed out. Sign in again, then try once more." };
  const day = dayKey();
  const { data } = await s.db.from("daily_posts").select("post").eq("day", day).maybeSingle();
  if (data) return { ok: true, post: data.post as DailyPost };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "The post could not be saved. Try again later." };
  const r = await preparePost(admin as unknown as Parameters<typeof preparePost>[0], aiProviders(process.env, (await headers()).get("x-vercel-oidc-token")), day, topicsFor(day)[0]);
  const { data: saved } = await admin.from("daily_posts").select("post").eq("day", day).maybeSingle();
  if (!r.written || !saved) return { ok: false, error: "The post could not be written. Try again in a minute." };
  revalidatePath("/study");
  return { ok: true, post: saved.post as DailyPost };
}
