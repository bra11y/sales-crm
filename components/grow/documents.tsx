"use client";

import { type DragEvent, type FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { ALLOWED, DOC_KINDS, DOC_LABEL, type Doc, type DocKind, JOB_NEEDS, kindFromName, MAX_BYTES, readiness, safeName, SCHOLARSHIP_NEEDS } from "@/lib/grow/documents";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const FIELD = "w-full rounded-xl border border-line-strong bg-secondary px-3 h-11 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";
const EXPIRES: DocKind[] = ["passport", "national_id", "language_test", "proof_of_funds"];

export default function Documents({ docs, userId, need, now }: { docs: Doc[]; userId: string; need: DocKind | null; now: string }) {
  const id = useId();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocKind>(need ?? "cv");
  const [title, setTitle] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function pick(f: File | null | undefined) {
    if (!f) return;
    setError("");
    if (!ALLOWED.includes(f.type)) return setError("Use a PDF, JPG, PNG, WebP or Word file.");
    if (f.size > MAX_BYTES) return setError("That file is over 10 MB. Scan it at a lower size, or save it as PDF.");
    setFile(f);
    if (!need) setKind(kindFromName(f.name));
    setTitle(
      f.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[_-]+/g, " ")
        .trim()
        .slice(0, 200),
    );
  }

  // Asked for a missing document: pick its type and open the file picker.
  function ask(k: DocKind) {
    setKind(k);
    setStatus(`Pick your ${DOC_LABEL[k].toLowerCase()} to upload.`);
    document.getElementById(`${id}-file`)?.focus();
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!file) {
      setError("Choose a file first.");
      fileRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Uploading to your private folder…");
    const sb = supabaseBrowser();
    const path = `${userId}/${Date.now()}-${safeName(file.name)}`;
    const up = await sb.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) {
      setBusy(false);
      setStatus("");
      return setError("The upload did not finish. Check your connection and try again.");
    }
    const { error: rowError } = await sb.from("documents").insert({ kind, title: title.trim() || DOC_LABEL[kind], path, mime: file.type, size_bytes: file.size, expires_on: expires || null });
    if (rowError) {
      await sb.storage.from("documents").remove([path]);
      setBusy(false);
      setStatus("");
      return setError("The file uploaded but could not be saved to your list. Try again.");
    }
    setBusy(false);
    setStatus(`${title || DOC_LABEL[kind]} saved as ${DOC_LABEL[kind]}.`);
    setFile(null);
    setTitle("");
    setExpires("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  const today = new Date(now);
  const school = readiness(docs, SCHOLARSHIP_NEEDS, today);
  const jobs = readiness(docs, JOB_NEEDS, today);
  const byKind = DOC_KINDS.map((k) => ({ k, list: docs.filter((d) => d.kind === k) })).filter((g) => g.list.length);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={`${id}-ready`} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <h2 id={`${id}-ready`} className="sr-only">
          What you are ready for
        </h2>
        <Ready title="Schools and scholarships" r={school} total={SCHOLARSHIP_NEEDS.length} onAsk={ask} />
        <Ready title="Jobs" r={jobs} total={JOB_NEEDS.length} onAsk={ask} />
      </section>
      {school.expiring.length > 0 && (
        <p role="note" className="rounded-xl bg-(--tag-amber-bg) px-4 py-3 text-[14px] text-(--tag-amber-text)">
          Expiring within 6 months: {school.expiring.map((d) => `${d.title} (${d.expires_on})`).join(", ")}. Many schools refuse a passport with under 6 months left.
        </p>
      )}

      <BulkAdd userId={userId} />

      <section aria-labelledby={`${id}-add`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
        <h2 id={`${id}-add`} className="text-[20px] font-semibold tracking-[-0.015em]">
          Add one document
        </h2>
        <form onSubmit={upload} aria-busy={busy} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setOver(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={cn("border-line-strong flex flex-col gap-2 rounded-2xl border-2 border-dashed p-4 sm:col-span-2", over && "border-ring bg-white/[0.04]")}
          >
            <label htmlFor={`${id}-file`} className="text-[15px] font-medium">
              File (required)
            </label>
            <input
              ref={fileRef}
              id={`${id}-file`}
              type="file"
              accept={ALLOWED.join(",")}
              aria-describedby={`${id}-file-hint${error ? ` ${id}-err` : ""}`}
              aria-invalid={error ? true : undefined}
              onChange={(e) => pick(e.target.files?.[0])}
              className="text-soft file:bg-secondary file:text-foreground focus-visible:ring-ring file:border-line-strong min-h-11 w-full rounded-lg text-[15px] outline-none file:mr-3 file:h-11 file:cursor-pointer file:rounded-xl file:border file:px-4 file:text-[15px] focus-visible:ring-2"
            />
            <p id={`${id}-file-hint`} className="text-soft text-[13px] leading-normal">
              PDF, photo or Word file, up to 10 MB. Or drop it here. Only you can open it.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-kind`} className="text-[15px] font-medium">
              What it is
            </label>
            <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as DocKind)} className={cn(FIELD, "cursor-pointer")}>
              {DOC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOC_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-title`} className="text-[15px] font-medium">
              Name
            </label>
            <input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={DOC_LABEL[kind]} className={FIELD} />
          </div>
          {EXPIRES.includes(kind) && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-exp`} className="text-[15px] font-medium">
                Expiry date
              </label>
              <input id={`${id}-exp`} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} aria-describedby={`${id}-exp-hint`} className={FIELD} />
              <p id={`${id}-exp-hint`} className="text-soft text-[13px]">
                You get a warning 6 months before it runs out.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" size="md" aria-disabled={busy} className="h-12 rounded-xl px-6 text-[15px] sm:self-start">
              {busy ? "Uploading…" : "Upload"}
            </Button>
            <p role="status" aria-live="polite" className="text-soft empty:hidden">
              {status}
            </p>
            {error && (
              <p id={`${id}-err`} role="alert" className="text-danger">
                {error}
              </p>
            )}
          </div>
        </form>
      </section>

      <section aria-labelledby={`${id}-list`} className="flex flex-col gap-3">
        <h2 id={`${id}-list`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
          Your documents <span className="text-soft font-normal tabular-nums">{docs.length}</span>
        </h2>
        {byKind.length === 0 ? (
          <p className="text-soft rounded-2xl bg-white/[0.04] p-5">Nothing yet. Start with your CV and passport: almost every application asks for them.</p>
        ) : (
          byKind.map(({ k, list }) => (
            <div key={k} className="flex flex-col gap-1">
              <h3 className="text-soft px-1 text-[13px] font-semibold tracking-wide uppercase">{DOC_LABEL[k]}</h3>
              <ul className="flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.04]">
                {list.map((d) => (
                  <Row key={d.id} d={d} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

type Queued = { file: File; kind: DocKind; state: "waiting" | "done" | "failed"; why?: string };

// Pick a whole folder of files at once. Each one gets its type from its name, which you can change.
function BulkAdd({ userId }: { userId: string }) {
  const id = useId();
  const router = useRouter();
  const [queue, setQueue] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  function pick(list: FileList | null) {
    if (!list) return;
    const next = [...list].map((file): Queued => {
      if (!ALLOWED.includes(file.type)) return { file, kind: "other", state: "failed", why: "Not a PDF, photo or Word file" };
      if (file.size > MAX_BYTES) return { file, kind: "other", state: "failed", why: "Over 10 MB" };
      return { file, kind: kindFromName(file.name), state: "waiting" };
    });
    setQueue(next);
    setStatus(`${next.filter((q) => q.state === "waiting").length} of ${next.length} files ready. Check each type, then press Upload all.`);
  }

  async function uploadAll() {
    if (busy) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const out = [...queue];
    let done = 0;
    for (let i = 0; i < out.length; i++) {
      const q = out[i];
      if (q.state !== "waiting") continue;
      setStatus(`Uploading ${i + 1} of ${out.length}: ${q.file.name}`);
      const path = `${userId}/${Date.now()}-${safeName(q.file.name)}`;
      const up = await sb.storage.from("documents").upload(path, q.file, { contentType: q.file.type, upsert: false });
      const title =
        q.file.name
          .replace(/\.[a-z0-9]+$/i, "")
          .replace(/[_-]+/g, " ")
          .trim()
          .slice(0, 200) || DOC_LABEL[q.kind];
      const row = up.error ? null : await sb.from("documents").insert({ kind: q.kind, title, path, mime: q.file.type, size_bytes: q.file.size });
      if (up.error || row?.error) {
        if (!up.error) await sb.storage.from("documents").remove([path]);
        out[i] = { ...q, state: "failed", why: "Did not upload. Try it again." };
      } else {
        out[i] = { ...q, state: "done" };
        done++;
      }
      setQueue([...out]);
    }
    setBusy(false);
    const failed = out.filter((q) => q.state === "failed").length;
    setStatus(`${done} saved.${failed ? ` ${failed} did not upload: see the list.` : ""}`);
    router.refresh();
  }

  const waiting = queue.filter((q) => q.state === "waiting").length;
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
      <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
        Add all your documents at once
      </h2>
      <p className="text-soft leading-normal">
        Pick every file together: CV, transcript, certificates, passport, ID, local government certificate. Each one is sorted by its file name, and you can change the type before uploading. Only you
        can open them.
      </p>
      <label htmlFor={`${id}-files`} className="text-[15px] font-medium">
        Files
      </label>
      <input
        id={`${id}-files`}
        type="file"
        multiple
        accept={ALLOWED.join(",")}
        onChange={(e) => pick(e.target.files)}
        className="text-soft file:bg-secondary file:text-foreground focus-visible:ring-ring file:border-line-strong min-h-11 w-full rounded-lg text-[15px] outline-none file:mr-3 file:h-11 file:cursor-pointer file:rounded-xl file:border file:px-4 file:text-[15px] focus-visible:ring-2"
      />
      {queue.length > 0 && (
        <ul className="flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-xl bg-white/[0.03]">
          {queue.map((q, i) => (
            <li key={`${q.file.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 break-words">{q.file.name}</span>
              {q.state === "waiting" ? (
                <>
                  <label htmlFor={`${id}-k-${i}`} className="sr-only">
                    Type of {q.file.name}
                  </label>
                  <select
                    id={`${id}-k-${i}`}
                    value={q.kind}
                    disabled={busy}
                    onChange={(e) => setQueue((all) => all.map((x, j) => (j === i ? { ...x, kind: e.target.value as DocKind } : x)))}
                    className={cn(FIELD, "w-auto cursor-pointer")}
                  >
                    {DOC_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {DOC_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span className={cn("text-[14px]", q.state === "done" ? "text-success" : "text-danger")}>{q.state === "done" ? `Saved as ${DOC_LABEL[q.kind]}` : q.why}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {waiting > 0 && (
        <Button type="button" variant="primary" size="md" aria-disabled={busy} onClick={uploadAll} className="h-12 rounded-xl px-6 text-[15px] sm:self-start">
          {busy ? "Uploading…" : `Upload all ${waiting}`}
        </Button>
      )}
      <p role="status" aria-live="polite" className="text-soft empty:hidden">
        {status}
      </p>
    </section>
  );
}

function Ready({ title, r, total, onAsk }: { title: string; r: ReturnType<typeof readiness>; total: number; onAsk: (k: DocKind) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <p className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
        {r.have.length}
        <span className="text-soft text-[17px] font-normal"> of {total} ready</span>
      </p>
      {r.missing.length ? (
        <ul aria-label={`Missing for ${title.toLowerCase()}`} className="flex flex-wrap gap-2">
          {r.missing.map((k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => onAsk(k)}
                className="border-line-strong focus-visible:ring-ring inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[14px] outline-none hover:bg-white/[0.06] focus-visible:ring-2"
              >
                <span aria-hidden>+</span> Upload {DOC_LABEL[k].toLowerCase()}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-success text-[14px] font-medium">Everything most applications ask for is here.</p>
      )}
    </div>
  );
}

function Row({ d }: { d: Doc }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState("");

  // A link that works for 2 minutes, so the file is never public.
  async function open() {
    const { data, error } = await supabaseBrowser().storage.from("documents").createSignedUrl(d.path, 120);
    if (error || !data) return setMsg("It could not be opened. Reload and try again.");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove() {
    const sb = supabaseBrowser();
    const { error } = await sb.from("documents").delete().eq("id", d.id);
    if (error) return setMsg("It could not be removed. Reload and try again.");
    await sb.storage.from("documents").remove([d.path]);
    router.refresh();
  }

  const size = d.size_bytes > 1_048_576 ? `${(d.size_bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(d.size_bytes / 1024))} KB`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium break-words">{d.title}</span>
        <span className="text-soft text-[13px] tabular-nums">
          {size}
          {d.expires_on ? ` · expires ${d.expires_on}` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-3" onClick={open}>
          Open<span className="sr-only"> {d.title} (opens in a new tab)</span>
        </Button>
        {sure ? (
          <>
            <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-3" onClick={remove}>
              Yes, delete it
            </Button>
            <Button type="button" variant="ghost" size="md" className="h-11 px-3" onClick={() => setSure(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => setSure(true)}>
            Delete<span className="sr-only"> {d.title}</span>
          </Button>
        )}
      </div>
      {msg && (
        <p role="alert" className="text-danger w-full text-[14px]">
          {msg}
        </p>
      )}
    </li>
  );
}
