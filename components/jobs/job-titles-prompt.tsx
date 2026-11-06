"use client";

import { type FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { saveJobTitles } from "@/app/(crm)/jobs/actions";
import { FIELD } from "@/components/learn/add-note";
import { cn } from "@/lib/utils";

const COMMON = ["Virtual Assistant", "Customer Support", "Social Media Manager", "Data Entry", "Bookkeeper", "Sales Representative", "Project Coordinator", "Content Writer", "Graphic Designer", "Frontend Developer"];

// The first question for someone new: which jobs to look for. Shown until they choose.
export default function JobTitlesPrompt({ fromCv }: { fromCv: string[] }) {
  const id = useId();
  const router = useRouter();
  const options = [...new Set([...fromCv, ...COMMON])].slice(0, 12);
  const [picked, setPicked] = useState<string[]>(fromCv.slice(0, 3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const typed = String(new FormData(e.currentTarget).get("other") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const titles = [...picked, ...typed];
    if (!titles.length) {
      setError("Pick or type at least one job title.");
      document.getElementById(`${id}-other`)?.focus();
      return;
    }
    setBusy(true);
    setError("");
    const r = await saveJobTitles(titles);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-h`} className="text-[22px] font-semibold tracking-[-0.015em]">
          What jobs do you want?
        </h2>
        <p className="text-soft leading-normal">Pick the job titles to search for. Only jobs with these titles, or other names for them, will show. You can change them any time in Settings.</p>
      </div>
      <form onSubmit={submit} aria-busy={busy} noValidate className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[15px] font-medium">{fromCv.length ? "From your CV, and other common jobs" : "Common jobs"}</legend>
          <div className="flex flex-wrap gap-2">
            {options.map((t) => {
              const on = picked.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t)}
                  className={cn("focus-visible:ring-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[14px] outline-none focus-visible:ring-2", on ? "border-foreground bg-foreground text-background font-medium" : "border-line-strong")}
                >
                  {on && <span aria-hidden>✓</span>}
                  {t}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-other`} className="text-[15px] font-medium">
            Other job titles (optional)
          </label>
          <input id={`${id}-other`} name="other" autoComplete="off" aria-describedby={`${id}-other-hint${error ? ` ${id}-err` : ""}`} aria-invalid={error ? true : undefined} className={FIELD} />
          <p id={`${id}-other-hint`} className="text-soft text-[13px]">
            Separate with commas, like: Executive Assistant, Customer Success.
          </p>
        </div>
        {error && (
          <p id={`${id}-err`} role="alert" className="text-danger text-[14px]">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" size="md" className="h-11 rounded-xl px-5" aria-disabled={busy}>
            {busy ? "Saving…" : "Save my job titles"}
          </Button>
        </div>
      </form>
    </section>
  );
}
