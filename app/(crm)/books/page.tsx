import type { Metadata } from "next";
import Link from "next/link";
import { BookShelf, CatalogList, UploadBook } from "@/components/learn/books";
import { PodcastList, ReadingList } from "@/components/learn/library";
import { Empty, LINK, Page, PageHead, ViewTabs } from "@/components/workspace/parts";
import { type CatalogBook, FIELD_LABEL, FIELD_SEARCH, FIELDS, type Field, fieldsForTracks, FREE_BOOKS, openLibraryUrl, parseOpenLibrary } from "@/lib/learn/books";
import { bookLessons, PODCASTS, READING_LIST } from "@/lib/learn/library";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Books and podcasts · Sales CRM", robots: { index: false } };
export const maxDuration = 300;

export type ShelfBook = {
  id: string;
  title: string;
  author: string;
  field: string;
  url: string | null;
  cover: string | null;
  access: "free" | "borrow" | null;
  path: string | null;
  mime: string | null;
  status: "want" | "reading" | "done";
  catalog_key: string | null;
  noteId: string | null;
};

async function searchOpenLibrary(words: string, f: Field): Promise<{ books: CatalogBook[]; failed: boolean }> {
  try {
    const res = await fetch(openLibraryUrl(words), { headers: { "user-agent": "SalesCRM-Learn/1.0 (+https://sales-crm-virid-ten.vercel.app)" }, next: { revalidate: 86_400 }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return { books: [], failed: true };
    return { books: parseOpenLibrary(await res.json(), f), failed: false };
  } catch {
    return { books: [], failed: true };
  }
}

const VIEWS = ["reading", "podcasts", "yours", "find"] as const;
type View = (typeof VIEWS)[number];

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ view?: string; field?: string; q?: string }> }) {
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : sp.field || sp.q ? "find" : "reading";
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? "";
  const [profile, books, notes] = await Promise.all([
    userId ? loadProfile(supabase, userId) : null,
    supabase.from("books").select("id, title, author, field, url, cover, access, path, mime, status, catalog_key").order("created_at", { ascending: false }),
    supabase.from("notes").select("id, book_id").not("book_id", "is", null),
  ]);
  const yours = fieldsForTracks(Object.keys(profile?.facts.tracks ?? {}));
  const field: Field = FIELDS.includes(sp.field as Field) ? (sp.field as Field) : yours[0];
  const words = (sp.q ?? "").trim().slice(0, 100);
  const noteFor = new Map((notes.data ?? []).map((n) => [n.book_id as string, n.id as string]));
  const shelf: ShelfBook[] = (books.data ?? []).map((b) => ({ ...b, noteId: noteFor.get(b.id) ?? null }) as ShelfBook);
  const saved = new Set(shelf.map((b) => b.catalog_key).filter(Boolean) as string[]);
  const order = [...yours, ...FIELDS.filter((f) => !yours.includes(f))];

  const lessons: Record<string, number> = {};
  if (view === "reading") {
    const counts = await Promise.all(READING_LIST.map(async (b) => [b.slug, (await bookLessons(b)).lessons.length] as const));
    for (const [slug, n] of counts) lessons[slug] = n;
  }
  const search = view === "find" ? await searchOpenLibrary(words || FIELD_SEARCH[field], field) : null;
  const listening = PODCASTS.reduce((t, e) => t + (e.paid ? 0 : e.seconds), 0);

  return (
    <Page>
      <PageHead
        title="Books and podcasts"
        intro="Read or listen in lessons of 2 hours or less. Every book here is free and legal, from the Internet Archive and Open Library."
        views={
          <ViewTabs
            label="Library views"
            current={`/books?view=${view}`}
            views={[
              { href: "/books?view=reading", label: "Reading list", count: READING_LIST.length },
              { href: "/books?view=podcasts", label: "Podcasts", count: PODCASTS.length },
              { href: "/books?view=yours", label: "Your books", count: shelf.length },
              { href: "/books?view=find", label: "Find free books" },
            ]}
          />
        }
      />
      {books.error && (
        <p role="alert" className="text-danger">
          Your books could not be loaded. If this is new, the database update may not be live yet.
        </p>
      )}

      {view === "reading" && (
        <section aria-labelledby="list-h" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="list-h" className="text-[22px] font-semibold tracking-[-0.015em]">
              Reading list
            </h2>
            <p className="text-soft max-w-[40em] text-[14px] leading-normal">
              Nine books on story, power, advertising and mindset. Five of them have free audiobooks, cut into lessons of whole chapters. The rest you can borrow or read.
            </p>
          </div>
          <ReadingList books={READING_LIST.map((b) => ({ slug: b.slug, title: b.title, author: b.author, why: b.why, read: b.read, cover: b.cover }))} lessons={lessons} saved={[...saved]} />
        </section>
      )}

      {view === "podcasts" && (
        <section aria-labelledby="pod-h" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="pod-h" className="text-[22px] font-semibold tracking-[-0.015em]">
              Podcasts
            </h2>
            <p className="text-soft max-w-[40em] text-[14px] leading-normal tabular-nums">
              Eight episodes on how founders work, about {Math.round(listening / 3600)} hours of free listening. Anything over 2 hours is split into parts.
            </p>
          </div>
          <PodcastList episodes={PODCASTS} />
        </section>
      )}

      {view === "yours" && (
        <>
          <section aria-labelledby="shelf-h" className="flex flex-col gap-4">
            <h2 id="shelf-h" className="text-[22px] font-semibold tracking-[-0.015em]">
              Your books <span className="text-soft tabular-nums">{shelf.length}</span>
            </h2>
            {shelf.length ? (
              <BookShelf books={shelf} />
            ) : (
              <Empty title="No books yet" action={<Link href="/books?view=reading" className={LINK}>Open the reading list</Link>}>
                Save a book from the reading list, or upload one of your own below.
              </Empty>
            )}
          </section>
          <UploadBook userId={userId} field={field} />
        </>
      )}

      {view === "find" && search && (
        <section aria-labelledby="free-h" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="free-h" className="text-[22px] font-semibold tracking-[-0.015em]">
              Free books for your field
            </h2>
            <p className="text-soft text-[14px]">Your fields come from your Profile. Every book here is free and legal to read.</p>
          </div>
          <ViewTabs label="Book fields" views={order.map((f) => ({ href: `/books?view=find&field=${f}`, label: FIELD_LABEL[f] }))} current={`/books?view=find&field=${field}`} />
          <CatalogList books={FREE_BOOKS.filter((b) => b.field === field)} saved={[...saved]} label={`Picked free books for ${FIELD_LABEL[field]}`} />

          <div className="flex flex-col gap-3 pt-2">
            <h3 className="text-[17px] font-semibold">{words ? `Open Library results for “${words}”` : `More from Open Library: ${FIELD_LABEL[field]}`}</h3>
            <form role="search" action="/books" className="flex w-full gap-2 sm:max-w-[30em]">
              <input type="hidden" name="view" value="find" />
              <input type="hidden" name="field" value={field} />
              <label htmlFor="book-search" className="sr-only">
                Search free books on Open Library
              </label>
              <input
                id="book-search"
                name="q"
                type="search"
                defaultValue={words}
                placeholder="Search free books, like WordPress"
                className="border-line-strong bg-secondary focus-visible:border-ring focus-visible:ring-ring h-10 min-w-0 flex-1 rounded-xl border px-3 text-[15px] outline-none focus-visible:ring-2"
              />
              <button type="submit" className="bg-secondary focus-visible:ring-ring h-10 rounded-xl px-4 text-[14px] font-medium outline-none hover:bg-white/[0.12] focus-visible:ring-2">
                Search books
              </button>
            </form>
            {search.failed ? (
              <p role="alert" className="text-danger">
                Open Library did not answer. Try again in a minute.
              </p>
            ) : search.books.length ? (
              <CatalogList books={search.books} saved={[...saved]} label="Open Library results" level={4} />
            ) : (
              <p className="text-soft">No free books matched. Try fewer or simpler words.</p>
            )}
          </div>
        </section>
      )}
    </Page>
  );
}
