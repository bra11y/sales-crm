import type { Metadata } from "next";
import { BookShelf, CatalogList, UploadBook } from "@/components/learn/books";
import { Empty, Page, PageHead, ViewTabs } from "@/components/workspace/parts";
import { type CatalogBook, FIELD_LABEL, FIELD_SEARCH, FIELDS, type Field, fieldsForTracks, FREE_BOOKS, openLibraryUrl, parseOpenLibrary } from "@/lib/learn/books";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Books · Sales CRM", robots: { index: false } };
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

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ field?: string; q?: string }> }) {
  const sp = await searchParams;
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
  const picks = FREE_BOOKS.filter((b) => b.field === field);
  const search = await searchOpenLibrary(words || FIELD_SEARCH[field], field);
  const order = [...yours, ...FIELDS.filter((f) => !yours.includes(f))];

  return (
    <Page>
      <PageHead
        title="Books"
        intro="Free books and guides for your field, and your own books. Get a summary of any of them, saved as a note you can turn into a post or a project."
      />
      {books.error && (
        <p role="alert" className="text-danger">
          Your books could not be loaded. If this is new, the database update may not be live yet.
        </p>
      )}

      <section aria-labelledby="shelf-h" className="flex flex-col gap-4">
        <h2 id="shelf-h" className="text-[20px] font-semibold tracking-[-0.015em]">
          Your books <span className="text-soft tabular-nums">{shelf.length}</span>
        </h2>
        {shelf.length ? <BookShelf books={shelf} /> : <Empty title="No books yet">Save a free book below, or upload one of your own.</Empty>}
      </section>

      <UploadBook userId={userId} field={field} />

      <section aria-labelledby="free-h" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="free-h" className="text-[20px] font-semibold tracking-[-0.015em]">
            Free books for your field
          </h2>
          <p className="text-soft text-[14px]">Your fields come from your Profile. Every book here is free and legal to read.</p>
        </div>
        <ViewTabs label="Book fields" views={order.map((f) => ({ href: `/books?field=${f}`, label: FIELD_LABEL[f] }))} current={`/books?field=${field}`} />
        <CatalogList books={picks} saved={[...saved]} label={`Picked free books for ${FIELD_LABEL[field]}`} />

        <div className="flex flex-col gap-3 pt-2">
          <h3 className="text-[17px] font-semibold">{words ? `Open Library results for “${words}”` : `More from Open Library: ${FIELD_LABEL[field]}`}</h3>
          <form role="search" action="/books" className="flex w-full gap-2 sm:max-w-[30em]">
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
              className="border-line-strong bg-secondary focus-visible:border-ring focus-visible:ring-ring h-11 min-w-0 flex-1 rounded-xl border px-3 text-[15px] outline-none focus-visible:ring-2"
            />
            <button type="submit" className="bg-secondary focus-visible:ring-ring h-11 rounded-xl px-4 text-[14px] font-medium outline-none focus-visible:ring-2">
              Search
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
    </Page>
  );
}
