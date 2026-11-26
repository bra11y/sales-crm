"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import AblePlayer from "@/components/learn/able-player";
import { saveCatalogBook } from "@/app/(crm)/books/actions";
import { clock, type Episode, type Lesson, type ListBook, READ_LABEL, READ_NOTE } from "@/lib/learn/library";

type Progress = { done: number[]; last: number };
const KEY = (slug: string) => `learn:progress:${slug}`;
const EMPTY = JSON.stringify({ done: [], last: 0 });
const listeners = new Set<() => void>();

function readRaw(slug: string): string {
  try {
    return localStorage.getItem(KEY(slug)) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function parse(raw: string): Progress {
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    return { done: Array.isArray(p.done) ? p.done.filter(Number.isInteger) : [], last: Number.isInteger(p.last) ? (p.last as number) : 0 };
  } catch {
    return { done: [], last: 0 };
  }
}

// Which lessons you finished, kept in this browser only.
export function useProgress(slug: string) {
  const raw = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => readRaw(slug),
    () => EMPTY,
  );
  const progress = parse(raw);
  const save = useCallback(
    (next: Progress) => {
      try {
        localStorage.setItem(KEY(slug), JSON.stringify(next));
      } catch {}
      listeners.forEach((fn) => fn());
    },
    [slug],
  );
  return { progress, save };
}

const CARD = "flex flex-col overflow-hidden rounded-2xl bg-white/[0.04] outline outline-1 -outline-offset-1 outline-white/[0.06]";
const SECONDARY =
  "bg-secondary focus-visible:ring-ring inline-flex h-10 items-center rounded-xl px-3.5 text-[14px] font-medium outline-none hover:bg-white/[0.12] active:scale-[0.97] focus-visible:ring-2 motion-reduce:active:scale-100";

function Cover({ src, size = "card" }: { src: string; size?: "card" | "hero" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size === "hero" ? 160 : 120}
      height={size === "hero" ? 240 : 180}
      loading="lazy"
      className={size === "hero" ? "aspect-[2/3] w-32 shrink-0 rounded-xl bg-white/5 object-cover shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:w-40" : "aspect-[2/3] w-20 shrink-0 rounded-lg bg-white/5 object-cover shadow-[0_4px_12px_rgba(0,0,0,0.4)]"}
    />
  );
}

function BookProgress({ slug, total }: { slug: string; total: number }) {
  const { progress } = useProgress(slug);
  const done = progress.done.filter((n) => n <= total).length;
  if (!done) return null;
  return (
    <p className="text-soft text-[13px] tabular-nums">
      {done} of {total} lessons done
    </p>
  );
}

export function ReadingList({ books, lessons, saved }: { books: Omit<ListBook, "audio">[]; lessons: Record<string, number>; saved: string[] }) {
  const router = useRouter();
  const [have, setHave] = useState<string[]>(saved);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");

  async function save(b: Omit<ListBook, "audio">) {
    setProblem("");
    const r = await saveCatalogBook({ title: b.title, author: b.author, url: b.read.url, cover: b.cover, key: b.read.url, access: b.read.kind === "free" ? "free" : "borrow", field: "career" });
    if (!r.ok) return setProblem(r.error);
    setHave((h) => [...h, b.read.url]);
    setStatus(`${b.title} is in Your books. Press Key ideas there for a summary.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Reading list" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {books.map((b) => {
          const count = lessons[b.slug] ?? 0;
          return (
            <li key={b.slug} className={`${CARD} gap-4 p-4 sm:flex-row`}>
              <Cover src={b.cover} />
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-[17px] leading-tight font-semibold tracking-[-0.01em]">{b.title}</h3>
                  <p className="text-soft text-[14px]">{b.author}</p>
                </div>
                <p className="text-[14px] leading-normal">{b.why}</p>
                <p className="text-soft text-[13px] leading-normal">
                  {count ? `${count} audio ${count === 1 ? "lesson" : "lessons"}, 2 hours or less each. ` : "No free audio. "}
                  {READ_NOTE[b.read.kind]}
                </p>
                {count > 0 && <BookProgress slug={b.slug} total={count} />}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {count > 0 && (
                    <Link href={`/books/listen/${b.slug}`} className={SECONDARY}>
                      Listen<span className="sr-only"> to {b.title}</span>
                    </Link>
                  )}
                  <a href={b.read.url} target="_blank" rel="noreferrer" className={SECONDARY}>
                    {READ_LABEL[b.read.kind]}
                    <span className="sr-only">: {b.title} (opens in a new tab)</span>
                  </a>
                  {have.includes(b.read.url) ? (
                    <span className="text-soft text-[14px]">In your books</span>
                  ) : (
                    <Button variant="ghost" size="md" className="h-10 px-3" onClick={() => save(b)}>
                      Save<span className="sr-only"> {b.title}</span> to my books
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
        {status}
      </p>
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

export function PodcastList({ episodes }: { episodes: Episode[] }) {
  return (
    <ul aria-label="Podcast episodes" className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.04] outline outline-1 -outline-offset-1 outline-white/[0.06]">
      {episodes.map((e) => (
        <li key={e.slug} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-soft text-[13px] font-medium">{e.show}</p>
            <h3 className="text-[16px] leading-snug font-semibold">{e.title}</h3>
            <p className="text-[14px] leading-normal">{e.why}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 sm:w-52 sm:flex-col sm:items-end">
            <span className="text-soft text-[13px] tabular-nums">
              {clock(e.seconds)}
              {e.seconds > 7200 ? ` · ${Math.ceil(e.seconds / 7200)} parts` : ""}
            </span>
            {e.paid ? (
              <a href={e.page} target="_blank" rel="noreferrer" className={SECONDARY}>
                Paid on {e.paid}
                <span className="sr-only">: {e.title} (opens in a new tab)</span>
              </a>
            ) : (
              <Link href={`/books/listen/${e.slug}`} className={SECONDARY}>
                Listen<span className="sr-only"> to {e.title}</span>
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Lessons({ slug, title, lessons, current, chosen, note }: { slug: string; title: string; lessons: Lesson[]; current: number; chosen: boolean; note: string }) {
  const { progress, save } = useProgress(slug);
  const lesson = lessons.find((l) => l.n === current) ?? lessons[0];
  const [status, setStatus] = useState("");
  const done = new Set(progress.done);

  const mark = useCallback(
    (n: number, on: boolean) => {
      const next = new Set(progress.done);
      if (on) next.add(n);
      else next.delete(n);
      save({ done: [...next].sort((a, b) => a - b), last: n });
      setStatus(on ? `Lesson ${n} marked as done.` : `Lesson ${n} marked as not done.`);
    },
    [progress.done, save],
  );
  const finished = useCallback(() => mark(lesson.n, true), [mark, lesson.n]);
  const last = progress.last;
  const doneList = progress.done;
  useEffect(() => {
    if (chosen && last !== lesson.n) save({ done: doneList, last: lesson.n });
  }, [chosen, last, doneList, lesson.n, save]);
  const resume = !chosen && progress.last > 1 && lessons.some((l) => l.n === progress.last) ? progress.last : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22em]">
      <section aria-labelledby="now-h" className="flex flex-col gap-4">
        {resume > 0 && (
          <p className="rounded-xl bg-(--tag-blue-bg) px-4 py-3 text-[14px] text-(--tag-blue-text)">
            You were on lesson {resume}.{" "}
            <Link href={`?lesson=${resume}`} className="font-medium underline underline-offset-2 focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2">
              Go back to lesson {resume}
            </Link>
          </p>
        )}
        <div className="flex flex-col gap-1">
          <p className="text-soft text-[13px] font-medium tabular-nums">
            Lesson {lesson.n} of {lessons.length} · {clock(lesson.seconds)}
          </p>
          <h2 id="now-h" className="text-[22px] leading-tight font-semibold tracking-[-0.015em]">
            {lesson.title}
          </h2>
        </div>
        <AblePlayer key={`${slug}-${lesson.n}`} id={`able-${slug}-${lesson.n}`} tracks={lesson.tracks} title={`${title}, lesson ${lesson.n}`} onFinished={finished} />
        <p className="text-soft text-[14px] leading-normal">{note}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-10 items-center gap-2 text-[14px]">
            <input type="checkbox" checked={done.has(lesson.n)} onChange={(e) => mark(lesson.n, e.target.checked)} className="accent-primary size-5" />
            I finished this lesson
          </label>
          {lessons.some((l) => l.n === lesson.n + 1) && (
            <Link href={`?lesson=${lesson.n + 1}`} className={SECONDARY}>
              Next lesson
            </Link>
          )}
        </div>
        <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
          {status}
        </p>
      </section>

      {lessons.length > 1 && (
        <nav aria-labelledby="all-h" className="flex flex-col gap-3">
          <h2 id="all-h" className="text-[17px] font-semibold">
            All lessons <span className="text-soft tabular-nums">{done.size ? `${[...done].filter((n) => n <= lessons.length).length} of ${lessons.length} done` : lessons.length}</span>
          </h2>
          <ol className="flex max-h-[34em] flex-col gap-1 overflow-y-auto rounded-2xl bg-white/[0.04] p-1.5 outline outline-1 -outline-offset-1 outline-white/[0.06]">
            {lessons.map((l) => {
              const here = l.n === lesson.n;
              return (
                <li key={l.n}>
                  <Link
                    href={`?lesson=${l.n}`}
                    aria-current={here ? "page" : undefined}
                    className={`focus-visible:ring-ring flex min-h-11 items-start gap-3 rounded-xl px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2 ${here ? "bg-white/[0.1]" : "hover:bg-white/[0.06]"}`}
                  >
                    <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] tabular-nums ${done.has(l.n) ? "bg-(--tag-green-bg) text-(--tag-green-text)" : "text-soft outline outline-1 outline-white/20"}`}>
                      {done.has(l.n) ? "✓" : l.n}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={here ? "font-medium" : ""}>
                        <span className="sr-only">Lesson {l.n}: </span>
                        {l.title}
                      </span>
                      <span className="text-soft text-[13px] tabular-nums">
                        {clock(l.seconds)}
                        {done.has(l.n) ? <span className="sr-only">, done</span> : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </div>
  );
}
