"use client";

import { type DragEvent, type FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { importCv } from "@/app/(crm)/profile/actions";
import { AREA, FIELD } from "@/components/learn/add-note";
import { cn } from "@/lib/utils";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Your CV is read on your own device, and only its text is sent, so there is no upload to fail
// on a slow connection. PDF (including LinkedIn's "Save to PDF") and Word files work.
async function readHere(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type || (name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".docx") ? DOCX : name.endsWith(".txt") || name.endsWith(".md") ? "text/plain" : "");
  if (type.startsWith("text/")) return file.text();
  if (type !== "application/pdf" && type !== DOCX) throw new Error("type");
  const { bookText } = await import("@/lib/learn/read-book");
  return (await bookText(await file.arrayBuffer(), type)).text;
}

type Step = { label: string; done: boolean; href: string };

export default function CvImport({ steps }: { userId?: string; steps: Step[] }) {
  const id = useId();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string[] | null>(null);
  const done = steps.filter((s) => s.done).length;
  const ready = done === steps.length;

  async function run(source: { text?: string; link?: string }, reading: string) {
    setBusy(true);
    setError("");
    setAdded(null);
    setStatus(reading);
    const r = await importCv(source);
    setBusy(false);
    setStatus("");
    if (!r.ok) return setError(r.error);
    setAdded(r.added);
    router.refresh();
  }

  async function take(file: File | undefined) {
    if (!file || busy) return;
    if (file.size > 15 * 1024 * 1024) return setError("That file is over 15 MB. Save your CV as a smaller PDF.");
    setBusy(true);
    setError("");
    setStatus("Reading your CV on this device…");
    let text = "";
    try {
      text = await readHere(file);
    } catch (e) {
      setBusy(false);
      setStatus("");
      return setError(
        e instanceof Error && e.message === "type"
          ? "Use a PDF or Word (.docx) file. From LinkedIn: open your profile, press More, then Save to PDF."
          : "This file could not be opened on this device. If it is in iCloud or Google Drive, open it once so it downloads, then try again. Or paste the text below.",
      );
    }
    if (text.trim().length < 200) {
      setBusy(false);
      setStatus("");
      return setError("No text was found in this file. If it is a scanned image, paste the text of your CV below instead.");
    }
    await run({ text }, "Building your Profile from your CV. About 10 seconds…");
    if (input.current) input.current.value = "";
  }

  function other(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const text = String(d.get("text") ?? "").trim();
    const link = String(d.get("link") ?? "").trim();
    if (!text && !link) return setError("Paste the text of your CV, or a link to your portfolio.");
    void run({ text, link }, link ? "Reading your page and building your Profile…" : "Building your Profile from your text…");
  }

  const drop = (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={`${id}-file`}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files[0]);
        }}
        className={cn(
          "border-line-strong has-focus-visible:ring-ring flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors has-focus-visible:ring-2",
          over && "border-foreground bg-white/[0.06]",
          busy && "pointer-events-none opacity-70",
        )}
      >
        <span aria-hidden className="text-[28px] leading-none">
          ⤒
        </span>
        <span className="text-[17px] font-semibold">{busy ? "Working on it…" : "Choose your CV"}</span>
        <span className="text-soft text-[14px] leading-normal">PDF or Word. Or drop it here. Your Profile fills itself in.</span>
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          disabled={busy}
          aria-describedby={`${id}-tip${error ? ` ${id}-err` : ""}`}
          onChange={(e) => void take(e.target.files?.[0])}
        />
      </label>
      <p id={`${id}-tip`} className="text-soft text-[13px] leading-normal">
        No CV to hand? On LinkedIn, open your profile, press <strong className="font-medium">More</strong>, then <strong className="font-medium">Save to PDF</strong>, and choose that file. Only facts found in it are added, and nothing you already wrote is changed.
      </p>
      <p role="status" aria-live="polite" className="text-[15px] font-medium empty:hidden">
        {status}
      </p>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-danger text-[14px] leading-normal">
          {error}
        </p>
      )}
      {added && (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-white/[0.06] p-4">
          <p className="font-semibold">{added.length ? "Your Profile is filled in." : "Your Profile already had everything in this CV."}</p>
          {added.length > 0 && (
            <>
              <p className="text-soft leading-normal">Added {added.join(", ")}. Read each line below and fix anything that is not quite right.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="md" className="h-11 rounded-xl px-4" href="#experience">
                  Check my experience
                </Button>
                <Button variant="secondary" size="md" className="h-11 rounded-xl px-4" href="/jobs">
                  See jobs that fit
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <details className="rounded-xl bg-white/[0.03] px-4 py-3">
        <summary className="focus-visible:ring-ring cursor-pointer rounded text-[15px] font-medium outline-none focus-visible:ring-2">Other ways: paste your CV, or a portfolio link</summary>
        <form onSubmit={other} aria-busy={busy} className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-text`} className="text-[15px] font-medium">
              Text of your CV
            </label>
            <textarea id={`${id}-text`} name="text" rows={4} className={AREA} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-link`} className="text-[15px] font-medium">
              Your portfolio or personal site
            </label>
            <input id={`${id}-link`} name="link" type="url" inputMode="url" autoComplete="url" placeholder="https://" aria-describedby={`${id}-link-hint`} className={FIELD} />
            <p id={`${id}-link-hint`} className="text-soft text-[13px]">
              A page that opens without signing in. LinkedIn pages can&apos;t be read this way: use its Save to PDF.
            </p>
          </div>
          <div>
            <Button type="submit" variant="secondary" size="md" className="h-11 rounded-xl px-5" aria-disabled={busy}>
              Build my Profile from this
            </Button>
          </div>
        </form>
      </details>
    </div>
  );

  if (ready && !added) {
    return (
      <details className="rounded-2xl bg-white/[0.04] px-5 py-4">
        <summary className="focus-visible:ring-ring cursor-pointer rounded text-[15px] font-medium outline-none focus-visible:ring-2">Add from a new CV</summary>
        <div className="pt-4">{drop}</div>
      </details>
    );
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-5 rounded-2xl bg-white/[0.04] p-5">
      <div className="flex flex-col gap-1.5">
        <h2 id={`${id}-h`} className="text-[22px] font-semibold tracking-[-0.015em]">
          {ready ? "Your Profile is set up" : "Set up your Profile in one step"}
        </h2>
        <p className="text-soft leading-normal">
          {done} of {steps.length} done.
        </p>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Profile steps">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5 text-[14px]">
              <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full text-[10px]", s.done ? "bg-foreground text-background" : "border-line-strong border")}>
                {s.done ? "✓" : ""}
              </span>
              <span className={s.done ? "text-soft" : ""}>{s.label}</span>
              <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
            </li>
          ))}
        </ul>
      </div>
      {drop}
    </section>
  );
}
