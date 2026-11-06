"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import {
  addTranscript,
  deleteNote,
  reviewNote,
  updateNote,
} from "@/app/(crm)/notes/actions";
import { useSummarise } from "@/components/learn/use-summarise";
import { AREA, FIELD } from "@/components/learn/add-note";
import { LINK } from "@/components/workspace/parts";
import type { Note } from "@/lib/learn/notes";
import { isDue, reviewLabel } from "@/lib/learn/review";

const FROM: Record<NonNullable<Note["transcript_from"]>, string> = {
  pasted: "pasted from YouTube",
  extension: "read by the extension",
  whisper: "written by speech to text",
  book: "read from the file",
  typed: "typed by you",
};

export default function NoteView({
  note,
  now,
  autoSummarise = false,
}: {
  note: Note;
  now: string;
  autoSummarise?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [sure, setSure] = useState(false);
  const today = new Date(now);
  const ai = note.ai;
  const refreshed = useCallback(() => {
    router.replace(`/notes/${note.id}`, { scroll: false });
    router.refresh();
  }, [router, note.id]);
  const summary = useSummarise(note.id, refreshed);
  const started = useRef(false);
  useEffect(() => {
    if (autoSummarise && !started.current) {
      started.current = true;
      void summary.run();
    }
  }, [autoSummarise, summary]);

  async function run(
    label: string,
    work: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done: string,
  ) {
    if (busy) return;
    setBusy(true);
    setProblem("");
    setStatus(label);
    const r = await work();
    setBusy(false);
    if (!r.ok) {
      setStatus("");
      return setProblem(r.error);
    }
    setStatus(done);
    router.refresh();
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setProblem("");
      setStatus(`${what} copied.`);
    } catch {
      setProblem(
        "Your browser blocked copying. Select the text and copy it by hand.",
      );
    }
  }

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    run(
      "Saving…",
      () =>
        updateNote(note.id, {
          title: String(d.get("title") ?? ""),
          body: String(d.get("body") ?? ""),
          tags: String(d.get("tags") ?? ""),
        }),
      "Your changes are saved.",
    );
  }

  function saveTranscript(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const words = String(new FormData(e.currentTarget).get("transcript") ?? "");
    if (busy || summary.busy) return;
    setBusy(true);
    setProblem("");
    setStatus("Saving the words…");
    void addTranscript(note.id, words).then((r) => {
      setBusy(false);
      if (!r.ok) {
        setStatus("");
        return setProblem(r.error);
      }
      setStatus("");
      void summary.run();
    });
  }

  const due = isDue(note.review_due, today);

  return (
    <article
      aria-labelledby={`${id}-title`}
      className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10"
    >
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-4">
          {note.video_id && (
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${note.video_id}`}
                title={`YouTube video: ${note.title}`}
                allow="encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                loading="lazy"
                className="h-full w-full"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-soft text-[14px]">
              {note.kind === "video"
                ? "Video"
                : note.kind === "book"
                  ? "Book"
                  : "Note"}
              {note.author ? ` · ${note.author}` : ""}
              {note.source_url && (
                <>
                  {" · "}
                  <a
                    href={note.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className={LINK}
                  >
                    Open the source
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </>
              )}
            </p>
            <h1
              id={`${id}-title`}
              className="text-[30px] leading-[1.1] font-bold tracking-[-0.025em] sm:text-[34px]"
            >
              {note.title}
            </h1>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
            <p
              className={
                due ? "font-medium text-(--tag-amber-text)" : "text-soft"
              }
            >
              {reviewLabel(note.review_step, note.review_due, today)}
            </p>
            {(due || note.review_due === null) && note.review_step < 5 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="md"
                  className="h-11 rounded-xl px-4"
                  aria-disabled={busy}
                  onClick={() =>
                    run(
                      "Saving…",
                      () => reviewNote(note.id, "remembered"),
                      "Marked as remembered. It comes back later.",
                    )
                  }
                >
                  I remember it
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  className="h-11 rounded-xl px-4"
                  aria-disabled={busy}
                  onClick={() =>
                    run(
                      "Saving…",
                      () => reviewNote(note.id, "again"),
                      "It comes back tomorrow.",
                    )
                  }
                >
                  Show me again tomorrow
                </Button>
              </div>
            )}
          </div>
          <p
            role="status"
            aria-live="polite"
            className="text-soft empty:hidden"
          >
            {summary.status || status}
          </p>
          {(problem || summary.error) && (
            <p role="alert" className="text-danger">
              {problem || summary.error}
            </p>
          )}
        </header>
        <Part title="Your notes">
          <form
            onSubmit={save}
            aria-busy={busy}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-t`} className="text-[15px] font-medium">
                Title (required)
              </label>
              <input
                id={`${id}-t`}
                name="title"
                defaultValue={note.title}
                required
                maxLength={300}
                className={FIELD}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-b`} className="text-[15px] font-medium">
                Your own words
              </label>
              <textarea
                id={`${id}-b`}
                name="body"
                defaultValue={note.body}
                rows={6}
                className={AREA}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-g`} className="text-[15px] font-medium">
                Tags
              </label>
              <input
                id={`${id}-g`}
                name="tags"
                defaultValue={note.tags.join(", ")}
                aria-describedby={`${id}-g-hint`}
                className={FIELD}
              />
              <p id={`${id}-g-hint`} className="text-soft text-[13px]">
                Separate with commas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="h-11 rounded-xl px-5"
                aria-disabled={busy}
              >
                Save changes
              </Button>
              {(note.transcript || note.body) && (
                <Button
                  variant="secondary"
                  size="md"
                  className="h-11 rounded-xl px-4"
                  aria-disabled={busy || summary.busy}
                  onClick={() => void summary.run()}
                >
                  {ai ? "Write the summary again" : "Write the summary"}
                </Button>
              )}
            </div>
          </form>
        </Part>

        {note.transcript && (
          <details className="rounded-2xl bg-white/[0.04] p-4">
            <summary className="focus-visible:ring-ring cursor-pointer rounded text-[15px] font-medium outline-none focus-visible:ring-2">
              The full words (
              {note.transcript_from ? FROM[note.transcript_from] : "saved"},{" "}
              {note.transcript.split(/\s+/).length.toLocaleString("en-GB")}{" "}
              words)
            </summary>
            <p className="mt-3 max-h-[28em] overflow-y-auto text-[14px] leading-relaxed whitespace-pre-line">
              {note.transcript}
            </p>
          </details>
        )}

        <div className="border-t border-white/10 pt-6">
          {sure ? (
            <div
              role="group"
              aria-label="Confirm deleting this note"
              className="flex flex-wrap items-center gap-3"
            >
              <p>Delete this note for good?</p>
              <Button
                variant="secondary"
                size="md"
                className="text-danger h-11 rounded-xl px-4"
                aria-disabled={busy}
                onClick={async () => {
                  const r = await deleteNote(note.id);
                  if (!r.ok) return setProblem(r.error);
                  router.push("/notes");
                }}
              >
                Yes, delete it
              </Button>
              <Button
                variant="ghost"
                size="md"
                className="h-11 px-3"
                onClick={() => setSure(false)}
                autoFocus
              >
                Keep it
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="md"
              className="text-soft h-11 px-3"
              onClick={() => setSure(true)}
            >
              Delete this note
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        {!note.transcript && note.kind === "video" && (
          <Part title="Add the video's words">
            <form
              onSubmit={saveTranscript}
              aria-busy={busy}
              className="flex flex-col gap-3"
            >
              <label htmlFor={`${id}-tr`} className="text-[15px] font-medium">
                Transcript (required)
              </label>
              <textarea
                id={`${id}-tr`}
                name="transcript"
                rows={6}
                required
                aria-describedby={`${id}-tr-hint`}
                className={AREA}
              />
              <p
                id={`${id}-tr-hint`}
                className="text-soft text-[13px] leading-normal"
              >
                On YouTube, open the description (“…more”), press “Show
                transcript”, select all the text in the panel and paste it here.
                On a computer, the extension does this for you.
              </p>
              <div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="h-11 rounded-xl px-5"
                  aria-disabled={busy}
                >
                  Save and summarise
                </Button>
              </div>
            </form>
          </Part>
        )}

        {note.ai_note && (
          <p
            role="note"
            className="rounded-xl bg-(--tag-amber-bg) px-4 py-3 text-[14px] text-(--tag-amber-text)"
          >
            {note.ai_note}
          </p>
        )}

        {!ai && (
          <section className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] p-5">
            <h2 className="text-[20px] font-semibold tracking-[-0.015em]">Summary</h2>
            <p className="text-soft leading-normal">
              {summary.busy
                ? "Writing it now. You can keep reading or add your own notes while you wait."
                : note.transcript || note.body
                  ? "No summary yet. Press “Write the summary” under Your notes."
                  : "Add the words of the video or your own notes, and the summary appears here."}
            </p>
          </section>
        )}

        {ai && (
          <>
            <Part title="Summary">
              <p className="leading-relaxed">{ai.summary}</p>
              <Copy
                onCopy={() => copy(ai.summary, "Summary")}
                label="Copy the summary"
              />
            </Part>

            <Part title="Key points">
              <ul className="flex list-disc flex-col gap-1.5 pl-5 leading-normal">
                {ai.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <Copy
                onCopy={() =>
                  copy(ai.points.map((p) => `- ${p}`).join("\n"), "Key points")
                }
                label="Copy the key points"
              />
            </Part>

            {ai.questions.length > 0 && (
              <Part title="Test yourself">
                <p className="text-soft text-[14px]">
                  Answer each one out loud or on paper before you look back at
                  the notes.
                </p>
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 leading-normal">
                  {ai.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ol>
              </Part>
            )}

            {ai.posts.length > 0 && (
              <Part title="Post drafts">
                <p className="text-soft text-[14px]">
                  Drafts in your voice. Read each one and make it yours before
                  you post.
                </p>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {ai.posts.map((p) => (
                    <li
                      key={p.platform}
                      className="flex flex-col gap-3 rounded-xl border border-white/10 p-4"
                    >
                      <h3 className="text-[15px] font-semibold">
                        {p.platform === "X" ? "X (Twitter)" : p.platform}
                      </h3>
                      <p className="flex-1 text-[14px] leading-relaxed whitespace-pre-line">
                        {p.text}
                      </p>
                      <p className="text-soft text-[13px] tabular-nums">
                        {p.text.length} characters
                      </p>
                      <Copy
                        onCopy={() => copy(p.text, `${p.platform} post`)}
                        label={`Copy the ${p.platform === "X" ? "X" : p.platform} post`}
                      />
                    </li>
                  ))}
                </ul>
              </Part>
            )}

            {(ai.ideas.length > 0 || ai.projects.length > 0) && (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                {ai.ideas.length > 0 && (
                  <Part title="Content ideas">
                    <ul className="flex list-disc flex-col gap-1.5 pl-5 leading-normal">
                      {ai.ideas.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </Part>
                )}
                {ai.projects.length > 0 && (
                  <Part title="Projects to practise">
                    <ul className="flex list-disc flex-col gap-1.5 pl-5 leading-normal">
                      {ai.projects.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </Part>
                )}
              </div>
            )}
            <p className="text-soft text-[13px]">
              Written by AI ({ai.provider}) from the source. Check facts before
              you use them.
            </p>
          </>
        )}
      </div>
    </article>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[20px] font-semibold tracking-[-0.015em]">{title}</h2>
      {children}
    </section>
  );
}

function Copy({ onCopy, label }: { onCopy: () => void; label: string }) {
  return (
    <div>
      <Button
        variant="secondary"
        size="md"
        className="h-11 rounded-xl px-4"
        onClick={onCopy}
      >
        {label}
      </Button>
    </div>
  );
}
