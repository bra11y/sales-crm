"use client";

import { type FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { addOwnBook, deleteBook, openOwnBook, saveCatalogBook, setBookStatus, summariseBook } from "@/app/(crm)/books/actions";
import type { ShelfBook } from "@/app/(crm)/books/page";
import { FIELD, uploadError, uploadPath } from "@/components/learn/add-note";
import { LINK } from "@/components/workspace/parts";
import { BOOK_STATUS_LABEL, BOOK_STATUSES, type BookStatus, type CatalogBook, FIELD_LABEL, FIELDS, type Field } from "@/lib/learn/books";
import { supabaseBrowser } from "@/lib/supabase/browser";

const MAX_BOOK = 25 * 1024 * 1024;

function Cover({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={64} height={96} loading="lazy" className="h-24 w-16 shrink-0 rounded-md bg-white/5 object-cover" />
  ) : (
    <span aria-hidden className="grid h-24 w-16 shrink-0 place-items-center rounded-md bg-white/5 text-[22px]">
      📖
    </span>
  );
}

export function CatalogList({ books, saved, label, level = 3 }: { books: CatalogBook[]; saved: string[]; label: string; level?: 3 | 4 }) {
  const H = level === 3 ? "h3" : "h4";
  const router = useRouter();
  const [done, setDone] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const have = new Set([...saved, ...done]);

  async function save(b: CatalogBook) {
    setProblem("");
    const r = await saveCatalogBook({ title: b.title, author: b.author, url: b.url, cover: b.cover, key: b.key, access: b.access, field: b.field });
    if (!r.ok) return setProblem(r.error);
    setDone((d) => [...d, b.key]);
    setStatus(`${b.title} saved to your books.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={label} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {books.map((b) => (
          <li key={b.key} className="flex gap-3 rounded-2xl bg-white/[0.04] p-4">
            <Cover src={b.cover} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <H className="text-[16px] leading-snug font-semibold">{b.title}</H>
                {b.author && <p className="text-soft text-[14px]">{b.author}</p>}
              </div>
              <p className="text-[14px] leading-normal">{b.why}</p>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <a href={b.url} target="_blank" rel="noreferrer" className="bg-secondary focus-visible:ring-ring inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-medium outline-none focus-visible:ring-2">
                  {b.access === "borrow" ? "Borrow free" : "Read free"}
                  <span className="sr-only">: {b.title} (opens in a new tab)</span>
                </a>
                {have.has(b.key) ? (
                  <span className="text-soft text-[14px]">In your books</span>
                ) : (
                  <Button variant="ghost" size="md" className="h-11 px-3" onClick={() => save(b)}>
                    Save<span className="sr-only"> {b.title}</span> to my books
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
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

export function BookShelf({ books }: { books: ShelfBook[] }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [sure, setSure] = useState<string | null>(null);

  async function act(bookId: string, label: string, work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    if (busy) return;
    setBusy(bookId);
    setProblem("");
    setStatus(label);
    const r = await work();
    setBusy(null);
    if (!r.ok) {
      setStatus("");
      return setProblem(r.error ?? "That did not work. Try again.");
    }
    setStatus(done);
    router.refresh();
  }

  async function summarise(b: ShelfBook) {
    if (busy) return;
    setBusy(b.id);
    setProblem("");
    setStatus(b.path ? `Reading the text of ${b.title}…` : `Writing the key ideas of ${b.title}…`);
    const r = await summariseBook(b.id);
    setBusy(null);
    if (!r.ok) {
      setStatus("");
      return setProblem(r.error);
    }
    setStatus(r.steps ? "The book was read. Opening its note to write the summary…" : "Done. Opening the key ideas…");
    router.push(`/notes/${r.noteId}${r.steps ? "?summarise=1" : ""}`);
  }

  async function open(b: ShelfBook) {
    const r = await openOwnBook(b.id);
    if (!r.ok) return setProblem(r.error);
    window.open(r.url, "_blank", "noopener");
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {books.map((b) => (
          <li key={b.id} aria-busy={busy === b.id} className="flex gap-3 rounded-2xl bg-white/[0.04] p-4">
            <Cover src={b.cover} />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-[16px] leading-snug font-semibold">{b.title}</h3>
                <p className="text-soft text-[14px]">
                  {[b.author, b.path ? (b.mime === "application/pdf" ? "Your PDF" : "Your EPUB") : b.access === "borrow" ? "Free to borrow" : "Free to read"].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${id}-${b.id}`} className="text-[13px] font-medium">
                  Reading status
                </label>
                <select
                  id={`${id}-${b.id}`}
                  value={b.status}
                  onChange={(e) => act(b.id, "Saving…", () => setBookStatus(b.id, e.target.value as BookStatus), `${b.title}: ${BOOK_STATUS_LABEL[e.target.value as BookStatus]}.`)}
                  className={`${FIELD} sm:w-56`}
                >
                  {BOOK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {BOOK_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {b.path ? (
                  b.mime === "application/pdf" ? (
                    <Button variant="secondary" size="md" className="h-11 rounded-xl px-4" onClick={() => open(b)}>
                      Open<span className="sr-only"> {b.title}</span>
                    </Button>
                  ) : (
                    <Button variant="secondary" size="md" className="h-11 rounded-xl px-4" href={`/books/${b.id}`}>
                      Read<span className="sr-only"> {b.title}</span> here
                    </Button>
                  )
                ) : (
                  b.url && (
                    <a href={b.url} target="_blank" rel="noreferrer" className="bg-secondary focus-visible:ring-ring inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-medium outline-none focus-visible:ring-2">
                      Read<span className="sr-only"> {b.title} (opens in a new tab)</span>
                    </a>
                  )
                )}
                {b.noteId ? (
                  <a href={`/notes/${b.noteId}`} className={`${LINK} inline-flex min-h-11 items-center px-1 text-[14px]`}>
                    Open the summary<span className="sr-only"> of {b.title}</span>
                  </a>
                ) : (
                  <Button variant="primary" size="md" className="h-11 rounded-xl px-4" aria-disabled={busy !== null} onClick={() => summarise(b)}>
                    {b.path ? "Summarise" : "Key ideas"}
                    <span className="sr-only">{b.path ? ` ${b.title}` : ` of ${b.title}`}</span>
                  </Button>
                )}
                {sure === b.id ? (
                  <>
                    <Button variant="ghost" size="md" className="text-danger h-11 px-3" onClick={() => act(b.id, "Removing…", () => deleteBook(b.id), `${b.title} was removed.`)}>
                      Yes, remove<span className="sr-only"> {b.title}</span>
                    </Button>
                    <Button variant="ghost" size="md" className="h-11 px-3" onClick={() => setSure(null)}>
                      Keep it
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => setSure(b.id)}>
                    Remove<span className="sr-only"> {b.title}</span>
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
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

export function UploadBook({ userId, field }: { userId: string; field: Field }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  function fail(name: string, message: string) {
    setBusy(false);
    setStatus("");
    setError({ field: name, message });
    requestAnimationFrame(() => document.getElementById(`${id}-${name}`)?.focus());
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const d = new FormData(form);
    const file = d.get("file");
    setError(null);
    setBusy(true);
    if (!(file instanceof File) || !file.size) return fail("file", "Choose a PDF or EPUB file.");
    const mime = file.type || (file.name.toLowerCase().endsWith(".epub") ? "application/epub+zip" : file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
    if (!["application/pdf", "application/epub+zip"].includes(mime)) return fail("file", "Use a PDF or EPUB file.");
    if (file.size > MAX_BOOK) return fail("file", "That file is over 25 MB. Try a smaller copy of the book.");
    const title = String(d.get("title") ?? "").trim() || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
    setStatus("Uploading to your private folder…");
    const path = uploadPath(userId, "books/", file.name);
    const up = await supabaseBrowser().storage.from("learning").upload(path, file, { contentType: mime, upsert: false });
    if (up.error) return fail("file", uploadError(up.error.message));
    const r = await addOwnBook({ path, title, author: String(d.get("author") ?? ""), mime, size: file.size, field: String(d.get("field") ?? field) });
    if (!r.ok) return fail("file", r.error);
    setBusy(false);
    setStatus(`${title} saved to your books. Press Summarise on it to get the summary.`);
    form.reset();
    router.refresh();
  }

  const invalid = (name: string) => (error?.field === name ? { "aria-invalid": true as const, "aria-describedby": `${id}-${name}-err ${id}-${name}-hint` } : { "aria-describedby": `${id}-${name}-hint` });

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-4 sm:p-5">
      <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
        Add your own book
      </h2>
      <form onSubmit={submit} aria-busy={busy} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-file`} className="text-[15px] font-medium">
            Book file (required)
          </label>
          <input
            id={`${id}-file`}
            name="file"
            type="file"
            accept=".pdf,.epub,application/pdf,application/epub+zip"
            className="text-soft file:bg-secondary file:text-foreground focus-visible:ring-ring file:border-line-strong min-h-11 w-full rounded-lg text-[15px] outline-none file:mr-3 file:h-11 file:cursor-pointer file:rounded-xl file:border file:px-4 file:text-[15px] focus-visible:ring-2"
            {...invalid("file")}
          />
          <p id={`${id}-file-hint`} className="text-soft text-[13px] leading-normal">
            A PDF or EPUB you own, up to 25 MB. Only you can open it. From Apple Books on a Mac, choose the book in Finder and use File, then Compress, if it will not upload.
          </p>
          {error?.field === "file" && (
            <p id={`${id}-file-err`} role="alert" className="text-danger text-[14px]">
              {error.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-title`} className="text-[15px] font-medium">
            Title (optional)
          </label>
          <input id={`${id}-title`} name="title" maxLength={200} className={FIELD} {...invalid("title")} />
          <p id={`${id}-title-hint`} className="text-soft text-[13px]">
            Left empty, the file name is used.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-author`} className="text-[15px] font-medium">
            Author (optional)
          </label>
          <input id={`${id}-author`} name="author" maxLength={200} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-field`} className="text-[15px] font-medium">
            Field
          </label>
          <select id={`${id}-field`} name="field" defaultValue={field} className={FIELD}>
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {FIELD_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" size="md" className="h-11 rounded-xl px-5" aria-disabled={busy}>
            {busy ? "Uploading…" : "Upload book"}
          </Button>
          <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
            {status}
          </p>
        </div>
      </form>
    </section>
  );
}
