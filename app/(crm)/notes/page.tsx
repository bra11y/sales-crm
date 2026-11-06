import type { Metadata } from "next";
import Link from "next/link";
import AddNote from "@/components/learn/add-note";
import { Empty, LINK, Page, PageHead } from "@/components/workspace/parts";
import { NOTE_LIST_COLS, type Note } from "@/lib/learn/notes";
import { isDue, reviewLabel } from "@/lib/learn/review";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notes · Sales CRM", robots: { index: false } };
export const maxDuration = 300;

const KIND: Record<Note["kind"], string> = { video: "Video", text: "Note", book: "Book" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const { q = "", tag = "" } = await searchParams;
  const words = q.trim().slice(0, 100);
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  let query = supabase.from("notes").select(NOTE_LIST_COLS).order("updated_at", { ascending: false }).limit(200);
  if (words) {
    const like = `"%${words.replace(/[%_,()"\\]/g, " ")}%"`;
    query = query.or(`title.ilike.${like},body.ilike.${like},author.ilike.${like}`);
  }
  if (tag) query = query.contains("tags", [tag.toLowerCase()]);
  const { data, error } = await query;
  const notes = (data ?? []) as Note[];
  const now = new Date();
  const due = notes.filter((n) => isDue(n.review_due, now));
  const tags = [...new Set(notes.flatMap((n) => n.tags))].sort().slice(0, 30);

  return (
    <Page>
      <PageHead
        title="Notes"
        intro="Save a YouTube video or anything you read, and get a summary, study questions, post drafts and project ideas. Notes come back for review so you don't forget them."
      />
      {error && (
        <p role="alert" className="text-danger">
          Your notes could not be loaded. If this is new, the database update may not be live yet.
        </p>
      )}

      <AddNote userId={auth.user?.id ?? ""} />

      {due.length > 0 && !words && !tag && (
        <section aria-labelledby="due-heading" className="flex flex-col gap-3">
          <h2 id="due-heading" className="text-[20px] font-semibold tracking-[-0.015em]">
            Due for review today <span className="text-soft tabular-nums">{due.length}</span>
          </h2>
          <NoteGrid notes={due} now={now} />
        </section>
      )}

      <section aria-labelledby="all-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="all-heading" className="text-[20px] font-semibold tracking-[-0.015em]">
            {words || tag ? "Matching notes" : "All notes"} <span className="text-soft tabular-nums">{notes.length}</span>
          </h2>
          <form role="search" action="/notes" className="flex w-full gap-2 sm:w-auto">
            <label htmlFor="note-search" className="sr-only">
              Search your notes
            </label>
            <input
              id="note-search"
              name="q"
              type="search"
              defaultValue={words}
              placeholder="Search titles and your notes"
              className="border-line-strong bg-secondary focus-visible:border-ring focus-visible:ring-ring h-11 min-w-0 flex-1 rounded-xl border px-3 text-[15px] outline-none focus-visible:ring-2 sm:w-64"
            />
            {tag && <input type="hidden" name="tag" value={tag} />}
            <button type="submit" className="bg-secondary focus-visible:ring-ring h-11 rounded-xl px-4 text-[14px] font-medium outline-none focus-visible:ring-2">
              Search
            </button>
          </form>
        </div>
        {tags.length > 0 && (
          <nav aria-label="Filter by tag" className="flex flex-wrap gap-2">
            {tag && (
              <Link href={words ? `/notes?q=${encodeURIComponent(words)}` : "/notes"} className={`${LINK} text-soft inline-flex min-h-8 items-center text-[14px]`}>
                Show all tags
              </Link>
            )}
            {tags.map((t) => (
              <Link
                key={t}
                href={`/notes?tag=${encodeURIComponent(t)}${words ? `&q=${encodeURIComponent(words)}` : ""}`}
                aria-current={t === tag ? "true" : undefined}
                className="focus-visible:ring-ring aria-[current=true]:bg-foreground aria-[current=true]:text-background bg-secondary inline-flex min-h-8 items-center rounded-full px-3 text-[13px] outline-none focus-visible:ring-2"
              >
                #{t}
              </Link>
            ))}
          </nav>
        )}
        {notes.length ? (
          <NoteGrid notes={notes} now={now} />
        ) : (
          <Empty title={words || tag ? "No notes match" : "No notes yet"}>
            {words || tag ? "Try other words, or clear the search." : "Paste a YouTube link above to make your first note."}
          </Empty>
        )}
      </section>
    </Page>
  );
}

function NoteGrid({ notes, now }: { notes: Note[]; now: Date }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((n) => (
        <li key={n.id}>
          <Link href={`/notes/${n.id}`} className="focus-visible:ring-ring flex h-full flex-col gap-3 rounded-2xl bg-white/[0.04] p-4 outline-none hover:bg-white/[0.07] focus-visible:ring-2">
            {n.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.thumbnail} alt="" width={480} height={360} loading="lazy" className="aspect-video w-full rounded-xl object-cover" />
            )}
            <span className="flex flex-col gap-1">
              <span className="text-soft text-[13px]">
                {KIND[n.kind]}
                {n.author ? ` · ${n.author}` : ""}
              </span>
              <span className="text-[16px] leading-snug font-semibold">{n.title}</span>
            </span>
            {n.ai?.summary && <span className="text-soft line-clamp-3 text-[14px] leading-normal">{n.ai.summary}</span>}
            <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className={isDue(n.review_due, now) ? "text-(--tag-amber-text)" : "text-soft"}>{reviewLabel(n.review_step, n.review_due, now)}</span>
              {!n.ai && <span className="text-soft">No summary yet</span>}
              {n.tags.slice(0, 3).map((t) => (
                <span key={t} className="text-soft">
                  #{t}
                </span>
              ))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
