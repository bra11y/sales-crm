"use client";

import { type FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { importCv } from "@/app/(crm)/profile/actions";
import { AREA, fileType, uploadError, uploadPath } from "@/components/learn/add-note";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TYPES = ["application/pdf", DOCX];

// Sets up the Profile from your own CV. Shown open while the Profile is missing steps,
// and as a small "add from a new CV" once it is set up.
export default function CvImport({ userId, steps }: { userId: string; steps: { label: string; done: boolean; href: string }[] }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const done = steps.filter((s) => s.done).length;
  const ready = done === steps.length;

  function fail(message: string) {
    setBusy(false);
    setStatus("");
    setError(message);
    requestAnimationFrame(() => document.getElementById(`${id}-file`)?.focus());
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const d = new FormData(e.currentTarget);
    const file = d.get("file");
    const text = String(d.get("text") ?? "").trim();
    setError("");
    setBusy(true);
    let input: { path?: string; mime?: string; text?: string } = { text };
    if (file instanceof File && file.size) {
      const type = file.type || (file.name.toLowerCase().endsWith(".docx") ? DOCX : fileType(file));
      if (!TYPES.includes(type)) return fail("Use a PDF or Word (.docx) file, or paste the text of your CV.");
      if (file.size > 10 * 1024 * 1024) return fail("That file is over 10 MB. Save your CV as a smaller PDF.");
      setStatus("Uploading your CV to your private Documents…");
      const path = uploadPath(userId, "", file.name);
      const sb = supabaseBrowser();
      const up = await sb.storage.from("documents").upload(path, file, { contentType: type, upsert: false });
      if (up.error) return fail(uploadError(up.error.message));
      await sb.from("documents").insert({ kind: "cv", title: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 200) || "CV", path, mime: type, size_bytes: file.size });
      input = { path, mime: type };
    } else if (text.length < 200) {
      return fail("Choose your CV file, or paste its text (at least a few lines).");
    }
    setStatus("Reading your CV. This takes about 10 seconds…");
    const r = await importCv(input);
    setBusy(false);
    if (!r.ok) return fail(r.error);
    setStatus(r.added.length ? `Added ${r.added.join(", ")}. Check each line below and fix anything that is not right.` : "Your Profile already has everything in this CV.");
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  const form = (
    <form onSubmit={submit} aria-busy={busy} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-file`} className="text-[15px] font-medium">
          Your CV as a file
        </label>
        <input
          id={`${id}-file`}
          name="file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-describedby={`${id}-file-hint${error ? ` ${id}-err` : ""}`}
          aria-invalid={error ? true : undefined}
          className="text-soft file:bg-secondary file:text-foreground focus-visible:ring-ring file:border-line-strong min-h-11 w-full rounded-lg text-[15px] outline-none file:mr-3 file:h-11 file:cursor-pointer file:rounded-xl file:border file:px-4 file:text-[15px] focus-visible:ring-2"
        />
        <p id={`${id}-file-hint`} className="text-soft text-[13px] leading-normal">
          PDF or Word, up to 10 MB. It is also saved in your Documents.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-text`} className="text-[15px] font-medium">
          Or paste the text of your CV
        </label>
        <textarea id={`${id}-text`} name="text" rows={4} className={AREA} />
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-danger text-[14px]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="md" className="h-11 rounded-xl px-5" aria-disabled={busy}>
          {busy ? "Reading…" : ready ? "Add from this CV" : "Set up from my CV"}
        </Button>
        <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
          {status}
        </p>
      </div>
      <p className="text-soft text-[13px] leading-normal">
        Only lines found in your CV are added, and nothing you already wrote is changed. A small AI model reads it; turn AI off in Settings if you prefer to type it in.
      </p>
    </form>
  );

  if (ready) {
    return (
      <details className="rounded-2xl bg-white/[0.04] px-5 py-4">
        <summary className="focus-visible:ring-ring cursor-pointer rounded text-[15px] font-medium outline-none focus-visible:ring-2">Add from a new CV</summary>
        <div className="pt-4">{form}</div>
      </details>
    );
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-5 rounded-2xl bg-white/[0.04] p-5">
      <div className="flex flex-col gap-1.5">
        <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
          Set up your Profile
        </h2>
        <p className="text-soft leading-normal">
          {done} of {steps.length} done. The fastest way is your CV: it fills in your details, skills, jobs and education for you to check.
        </p>
      </div>
      <ul className="flex flex-col gap-1.5" aria-label="Profile steps">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-[15px]">
            <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[12px]", s.done ? "bg-foreground text-background" : "border-line-strong border")}>
              {s.done ? "✓" : ""}
            </span>
            <a href={s.href} className={cn("focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2", s.done ? "text-soft" : "underline underline-offset-2")}>
              {s.label}
            </a>
            <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
          </li>
        ))}
      </ul>
      {form}
    </section>
  );
}
