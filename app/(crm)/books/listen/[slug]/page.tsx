import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lessons } from "@/components/learn/library";
import { LINK, Page } from "@/components/workspace/parts";
import { bookLessons, clock, episodeLessons, findBook, findEpisode, READ_LABEL } from "@/lib/learn/library";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lesson?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const name = findBook(slug)?.title ?? findEpisode(slug)?.title ?? "Listen";
  return { title: `${name} · Listen · Sales CRM`, robots: { index: false } };
}

export default async function Listen({ params, searchParams }: Props) {
  const { slug } = await params;
  const { lesson } = await searchParams;
  const book = findBook(slug);
  const episode = book ? null : findEpisode(slug);
  if (!book && !episode) notFound();

  const { lessons, failed } = book ? await bookLessons(book) : { lessons: episodeLessons(episode!), failed: false };
  const n = Number(lesson);
  const current = lessons.some((l) => l.n === n) ? n : 1;
  const total = lessons.reduce((t, l) => t + l.seconds, 0);
  const title = book?.title ?? episode!.title;
  const note = book
    ? "A LibriVox volunteer reads the book word for word, so the book's text is the transcript. Lessons are whole chapters, 2 hours or less."
    : episode!.youtube
      ? "This episode plays from YouTube, where it has automatic captions. Each part is 2 hours or less: stop at the time shown in the part's name."
      : "This episode plays from the show's own feed. The show does not publish a transcript.";

  return (
    <Page>
      <nav aria-label="Breadcrumb" className="text-soft text-[14px]">
        <Link href={book ? "/books" : "/books?view=podcasts"} className={LINK}>
          {book ? "Books" : "Podcasts"}
        </Link>
      </nav>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
        {book && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.cover} alt="" width={160} height={240} className="aspect-[2/3] w-32 shrink-0 rounded-xl bg-white/5 object-cover shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:w-40" />
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-soft text-[14px] font-medium">{book ? book.author : episode!.show}</p>
          <h1 className="text-[28px] leading-[1.05] font-bold tracking-[-0.025em] sm:text-[34px]">{title}</h1>
          <p className="max-w-[36em] text-[15px] leading-normal">{book?.why ?? episode!.why}</p>
          <p className="text-soft text-[14px] tabular-nums">
            {lessons.length ? `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"} · ${clock(total)} in all` : ""}
            {book && (
              <>
                {lessons.length ? " · " : ""}
                <a href={book.read.url} target="_blank" rel="noreferrer" className={LINK}>
                  {READ_LABEL[book.read.kind]}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </>
            )}
            {episode && (
              <>
                {" · "}
                <a href={episode.page} target="_blank" rel="noreferrer" className={LINK}>
                  Open the show page<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </>
            )}
          </p>
        </div>
      </header>

      {failed ? (
        <p role="alert" className="text-danger">
          The Internet Archive did not answer, so the lessons could not be loaded. Try again in a minute.
        </p>
      ) : lessons.length ? (
        <Lessons slug={slug} title={title} lessons={lessons} current={current} chosen={Boolean(lesson)} note={note} />
      ) : (
        <p className="text-soft">There is no free audio for this one.</p>
      )}
    </Page>
  );
}
