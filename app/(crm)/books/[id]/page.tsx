import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LINK, Page } from "@/components/workspace/parts";
import { epubText } from "@/lib/learn/read-book";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reading · Books · Sales CRM", robots: { index: false } };
export const maxDuration = 60;

// Your own EPUB as plain text, chapter by chapter, at a size you can read on a phone.
export default async function ReadBook({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: b } = await supabase.from("books").select("title, author, path, mime").eq("id", id).maybeSingle();
  if (!b?.path || b.mime !== "application/epub+zip") notFound();
  const { data: file } = await supabase.storage.from("learning").download(b.path);
  const text = file ? (await epubText(await file.arrayBuffer())).text : "";
  const chapters = text.split(/\n{2,}/).filter((p) => p.trim());

  return (
    <Page>
      <nav aria-label="Breadcrumb" className="text-soft text-[14px]">
        <Link href="/books" className={LINK}>
          Books
        </Link>
      </nav>
      <article className="mx-auto flex w-full max-w-[38em] flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.025em]">{b.title}</h1>
          {b.author && <p className="text-soft">{b.author}</p>}
        </header>
        {chapters.length ? (
          <div className="flex flex-col gap-4 text-[17px] leading-[1.7]">
            {chapters.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        ) : (
          <p role="alert" className="text-danger">
            The text of this book could not be read. Try uploading it again.
          </p>
        )}
      </article>
    </Page>
  );
}
