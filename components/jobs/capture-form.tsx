"use client";

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/_ui/button";
import { cn } from "@/lib/utils";

const FIELD =
  "w-full rounded-xl border border-line-strong bg-secondary px-3 text-[15px] text-foreground outline-none transition-[border-color] duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";
const PRIMARY = "h-12 rounded-xl px-6 text-[15px] active:scale-[0.98] motion-reduce:active:scale-100";
const LONG_SIDE = 2000;

type Read = { title: string; company: string; location: string; pay: string; link: string; email: string };
type Done = { id: string; duplicate: boolean; read: Read; warning?: string | null };

// Phone screenshots are large; a 2000px JPEG reads just as well, uploads fast and costs less.
async function shrink(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, LONG_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

// What the phone's Share menu handed over, kept by the service worker until this page reads it.
async function takeShared(): Promise<{ shot: File | null; text: string; link: string }> {
  const out = { shot: null as File | null, text: "", link: "" };
  if (!("caches" in window)) return out;
  const cache = await caches.open("share-inbox");
  const shot = await cache.match("/shared/shot");
  if (shot) {
    const blob = await shot.blob();
    out.shot = new File([blob], "shared-screenshot", { type: blob.type || "image/png" });
  }
  const note = await cache.match("/shared/note");
  if (note) {
    const n = (await note.json()) as { title?: string; text?: string; url?: string };
    const urlInText = n.text?.match(/https?:\/\/\S+/)?.[0] ?? "";
    out.link = n.url || urlInText;
    out.text = [n.title, n.text?.replace(urlInText, "")]
      .filter((s) => s && s.trim())
      .join("\n")
      .trim();
  }
  await Promise.all([cache.delete("/shared/shot"), cache.delete("/shared/note")]);
  return out;
}

export default function CaptureForm({ shared, missed, startText, startLink }: { shared: boolean; missed: boolean; startText: string; startLink: string }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const [shot, setShot] = useState<File | null>(null);
  const [text, setText] = useState(startText);
  const [link, setLink] = useState(startLink);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(missed ? "The screenshot did not come through. Pick it again below." : "");
  const [done, setDone] = useState<Done | null>(null);
  const [over, setOver] = useState(false);

  function pick(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("That file is not an image. Pick a screenshot.");
    setError("");
    setDone(null);
    setShot(file);
  }

  const preview = useMemo(() => (shot ? URL.createObjectURL(shot) : null), [shot]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  // A file picked before the page finished loading is still in the input: keep it.
  useEffect(() => {
    const early = fileRef.current?.files?.[0];
    if (early) pick(early);
  }, []);

  // Paste a screenshot straight from the clipboard (Ctrl+V or Cmd+V) anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        pick(file);
        setStatus("Screenshot pasted.");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function send(input: { shot: File | null; text: string; link: string }) {
    if (!input.shot && !input.text.trim()) return setError("Add a screenshot, or paste the job post's text.");
    setBusy(true);
    setError("");
    setDone(null);
    setStatus("Reading the job… this takes about 10 seconds.");
    try {
      const body = new FormData();
      if (input.shot) body.set("shot", await shrink(input.shot), "screenshot.jpg");
      body.set("text", input.text);
      body.set("link", input.link);
      const res = await fetch("/api/jobs/capture", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as Partial<Done> & { error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "The job could not be added. Try again.");
      setDone(data as Done);
      setStatus(data.duplicate ? "This job was already on your board." : "Job added to your board as Saved.");
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "The job could not be added. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Shared from the phone: start reading straight away.
  useEffect(() => {
    if (!shared) return;
    let live = true;
    takeShared().then((s) => {
      if (!live) return;
      if (s.shot) setShot(s.shot);
      if (s.text) setText(s.text);
      if (s.link) setLink(s.link);
      if (s.shot || s.text) send(s);
      else setError("Nothing came through from the share. Pick the screenshot below.");
    });
    return () => {
      live = false;
    };
  }, [shared]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!busy) send({ shot, text, link });
  }

  function reset() {
    setShot(null);
    setText("");
    setLink("");
    setDone(null);
    setStatus("");
    if (fileRef.current) fileRef.current.value = "";
    fileRef.current?.focus();
  }

  return (
    <div className="flex max-w-[40rem] flex-col gap-6">
      <form onSubmit={submit} aria-labelledby={`${id}-h`} aria-busy={busy} className="flex flex-col gap-5">
        <h2 id={`${id}-h`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
          The job you saw
        </h2>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn("border-line-strong flex flex-col gap-3 rounded-2xl border-2 border-dashed bg-white/[0.03] p-5", over && "border-ring bg-white/[0.06]")}
        >
          <label htmlFor={`${id}-shot`} className="text-[15px] font-medium">
            Screenshot of the job post
          </label>
          <input
            ref={fileRef}
            id={`${id}-shot`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-describedby={`${id}-shot-hint`}
            onChange={(e) => pick(e.target.files?.[0])}
            className="text-soft file:bg-secondary file:text-foreground focus-visible:ring-ring file:border-line-strong min-h-11 w-full rounded-lg text-[15px] outline-none file:mr-3 file:h-11 file:cursor-pointer file:rounded-xl file:border file:px-4 file:text-[15px] focus-visible:ring-2"
          />
          <p id={`${id}-shot-hint`} className="text-soft text-[13px] leading-normal">
            Pick it from your photos, drop it here, or paste it with Ctrl+V. Show the job title and company in the shot.
          </p>
          {preview && (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="The screenshot you picked" className="max-h-56 w-auto rounded-lg border border-white/[0.08]" />
              <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-4" onClick={() => setShot(null)}>
                Remove
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-link`} className="px-1 text-[15px] font-medium">
            Link to the job (optional)
          </label>
          <input id={`${id}-link`} type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} autoComplete="url" placeholder="https://" className={`${FIELD} h-12`} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-text`} className="px-1 text-[15px] font-medium">
            Or paste the post&rsquo;s text (optional)
          </label>
          <textarea id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-describedby={`${id}-text-hint`} className={`${FIELD} py-3 leading-relaxed`} />
          <p id={`${id}-text-hint`} className="text-soft px-1 text-[13px]">
            With no screenshot, the text alone is enough.
          </p>
        </div>

        <Button type="submit" variant="primary" size="md" aria-disabled={busy} className={cn(PRIMARY, "w-full")}>
          {busy ? "Reading…" : "Add to my jobs"}
        </Button>
        <p role="status" aria-live="polite" className="text-soft empty:hidden">
          {status}
        </p>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </form>

      {done && (
        <section aria-labelledby={`${id}-done`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
          <h2 id={`${id}-done`} ref={resultRef} tabIndex={-1} className="text-[20px] font-semibold tracking-[-0.015em] outline-none">
            {done.duplicate ? "Already on your board" : "Added to Saved"}
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
            <dt className="text-soft">Role</dt>
            <dd>{done.read.title}</dd>
            <dt className="text-soft">Company</dt>
            <dd>{done.read.company || "Not shown"}</dd>
            <dt className="text-soft">Where</dt>
            <dd>{done.read.location || "Not shown"}</dd>
            <dt className="text-soft">Pay</dt>
            <dd>{done.read.pay || "Not shown"}</dd>
            {done.read.email && (
              <>
                <dt className="text-soft">Apply email</dt>
                <dd className="break-all">{done.read.email}</dd>
              </>
            )}
          </dl>
          {!done.read.link && !link && (
            <p className="text-[14px] text-(--tag-amber-text)">No link was in the screenshot. Its link opens a web search, so you can find the real post and apply there.</p>
          )}
          {done.warning && <p className="text-[14px] text-(--tag-amber-text)">Heads up: {done.warning}.</p>}
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/apply?job=${done.id}`}
              className="bg-primary text-primary-foreground focus-visible:ring-ring inline-flex h-11 items-center rounded-xl px-4 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Apply now
            </Link>
            <Link
              href={`/jobs?open=${done.id}`}
              className="bg-secondary focus-visible:ring-ring border-line-strong inline-flex h-11 items-center rounded-xl border px-4 text-[15px] outline-none focus-visible:ring-2"
            >
              Open the job
            </Link>
            <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-4" onClick={reset}>
              Add another
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
