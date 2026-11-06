import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NoteView from "@/components/learn/note-view";
import { LINK, Page } from "@/components/workspace/parts";
import { NOTE_COLS, type Note } from "@/lib/learn/notes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 300;

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("notes").select(NOTE_COLS).eq("id", id).maybeSingle();
  return data as Note | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const note = await load((await params).id);
  return { title: `${note?.title ?? "Note"} · Notes · Sales CRM`, robots: { index: false } };
}

export default async function NotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ summarise?: string }> }) {
  const note = await load((await params).id);
  const autoSummarise = (await searchParams).summarise === "1";
  if (!note) notFound();
  return (
    <Page>
      <nav aria-label="Breadcrumb" className="text-soft text-[14px]">
        <Link href="/notes" className={LINK}>
          Notes
        </Link>
      </nav>
      <NoteView note={note} now={new Date().toISOString()} autoSummarise={autoSummarise} />
    </Page>
  );
}
