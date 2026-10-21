"use client";

import { useState, useTransition } from "react";
import Button, { buttonVariants } from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/_ui/sheet";
import { researchCompany } from "@/app/(crm)/jobs/actions";
import type { CompanyInfo } from "@/lib/jobs/company";
import type { JobItem, SourceNames } from "./jobs-board";
import { ago, BAND, payText, type Status, STATUS_LABEL, WHERE_LABEL } from "./labels";

type Props = {
  job: JobItem | null;
  sources: SourceNames;
  onClose: () => void;
  onMove: (id: string, status: Status) => void;
  onCompany: (id: string, info: CompanyInfo) => void;
  onError: (message: string) => void;
};

export default function JobPeek({ job, sources, onClose, onMove, onCompany, onError }: Props) {
  return (
    <Sheet open={Boolean(job)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="bg-background/92 supports-[backdrop-filter]:backdrop-blur-xl motion-reduce:animate-none max-w-[40em] contrast-more:bg-background [@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none"
        aria-describedby={job ? "job-peek-company" : undefined}
      >
        {job && <PeekBody key={job.id} job={job} sources={sources} onMove={onMove} onCompany={onCompany} onError={onError} />}
      </SheetContent>
    </Sheet>
  );
}

function PeekBody({ job, sources, onMove, onCompany, onError }: Omit<Props, "job" | "onClose"> & { job: JobItem }) {
  const [looking, startLook] = useTransition();
  const [lookNote, setLookNote] = useState("");
  const source = sources[job.source];
  const band = BAND[job.band];

  function lookUp() {
    if (looking || !job.company) return;
    startLook(async () => {
      setLookNote("Looking up the company…");
      const r = await researchCompany(job.id);
      if (!r.ok) {
        setLookNote("");
        onError(r.error);
        return;
      }
      onCompany(job.id, r.info);
      setLookNote(r.info.summary ? "Company found." : "Links ready. The company site gave no summary.");
    });
  }

  return (
    <>
      <SheetHeader className="h-auto min-h-14 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <SheetTitle className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">{job.title}</SheetTitle>
          <SheetDescription id="job-peek-company" className="text-soft">
            {job.company || "Company not named"} · via{" "}
            <a href={source?.home ?? job.url} className="underline underline-offset-2" target="_blank" rel="noopener">
              {source?.name ?? job.source}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </SheetDescription>
        </div>
        <SheetClose asChild>
          <Button variant="ghost" size="none" className="size-11 shrink-0 rounded-full text-[20px]" aria-label="Close job details">
            <span aria-hidden>×</span>
          </Button>
        </SheetClose>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        <dl className="grid grid-cols-[9em_1fr] gap-x-4 gap-y-2.5 text-[14px]">
          <dt className="text-soft">Fit</dt>
          <dd>
            <Tag tone={band.tone} size="sm">
              {job.score} {band.label}
            </Tag>
          </dd>
          <dt className="text-soft">Where</dt>
          <dd>
            {WHERE_LABEL[job.eligibility]}
            {job.location ? ` · ${job.location.slice(0, 120)}` : ""}
          </dd>
          <dt className="text-soft">Pay</dt>
          <dd>{payText(job.pay_monthly_usd)}</dd>
          <dt className="text-soft">Posted</dt>
          <dd>{ago(job.posted_at)}</dd>
          {job.employment_type && (
            <>
              <dt className="text-soft">Type</dt>
              <dd>{job.employment_type}</dd>
            </>
          )}
          <dt className="text-soft">
            <label htmlFor="job-peek-status">Status</label>
          </dt>
          <dd>
            <select
              id="job-peek-status"
              value={job.status}
              onChange={(e) => onMove(job.id, e.target.value as Status)}
              className="border-line-strong bg-secondary focus-visible:ring-ring h-11 rounded-lg border px-3 outline-none focus-visible:ring-2"
            >
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </dd>
        </dl>

        {job.hidden_reason && (
          <p className="rounded-lg border border-(--tag-amber-border) bg-(--tag-amber-bg) p-3 text-(--tag-amber-text)">
            <strong>Hidden from your list:</strong> {job.hidden_reason}.
          </p>
        )}

        <section aria-labelledby="peek-why" className="flex flex-col gap-2">
          <h3 id="peek-why" className="font-semibold">
            Why it fits
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 leading-normal">
            {job.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        {job.flags.length > 0 && (
          <section aria-labelledby="peek-flags" className="flex flex-col gap-2 rounded-lg border border-(--tag-amber-border) bg-(--tag-amber-bg) p-3 text-(--tag-amber-text)">
            <h3 id="peek-flags" className="font-semibold">
              Check before you apply
            </h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 leading-normal">
              {job.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
        )}

        {job.matched.length > 0 && (
          <section aria-labelledby="peek-skills" className="flex flex-col gap-2">
            <h3 id="peek-skills" className="font-semibold">
              Your skills it asks for
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {job.matched.map((m) => (
                <li key={m}>
                  <Tag tone="green" size="sm">
                    {m}
                  </Tag>
                </li>
              ))}
            </ul>
          </section>
        )}

        {job.gaps.length > 0 && (
          <p className="leading-normal">
            <strong>Tools it names that you have not used:</strong> {job.gaps.join(", ")}. Your CV will leave these out.
          </p>
        )}

        <section aria-labelledby="peek-company" className="flex flex-col gap-2">
          <h3 id="peek-company" className="font-semibold">
            About {job.company || "the company"}
          </h3>
          {job.company_info ? (
            <>
              {job.company_info.summary ? <p className="leading-normal">{job.company_info.summary}</p> : <p className="text-soft">The company site gave no summary.</p>}
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {job.company_info.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center underline underline-offset-2">
                      {l.label}
                      <span className="sr-only"> for {job.company} (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Button variant="secondary" size="md" className="h-11 self-start px-4" onClick={lookUp} aria-disabled={looking || !job.company}>
              {looking ? "Looking up…" : "Look up the company"}
            </Button>
          )}
          <p role="status" aria-live="polite" className="caption-style text-soft empty:hidden">
            {lookNote}
          </p>
        </section>

        <details className="group border-line-strong rounded-lg border">
          <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer items-center px-3 font-medium outline-none focus-visible:ring-2">
            Read the full job post
          </summary>
          <div className="text-soft max-h-[28em] overflow-y-auto px-3 pb-3 text-[14px] leading-relaxed whitespace-pre-line">{job.description || "The board sent no description."}</div>
        </details>
      </div>

      <div className="border-line-strong flex shrink-0 flex-wrap items-center gap-2 border-t px-6 py-3">
        <Button variant="primary" size="md" className="h-11 px-4" href={`/apply?job=${job.id}`}>
          Tailor my CV for this job
        </Button>
        <a href={job.apply_url} target="_blank" rel="noopener" className={buttonVariants({ variant: "secondary", size: "md", className: "h-11 px-4" })}>
          Open the job post<span className="sr-only"> on {source?.name ?? "the job board"} (opens in a new tab)</span>
        </a>
        {job.status !== "saved" && job.status !== "applied" && (
          <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => onMove(job.id, "saved")}>
            Save
          </Button>
        )}
        {job.status !== "dismissed" && (
          <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => onMove(job.id, "dismissed")}>
            Not for me
          </Button>
        )}
      </div>
    </>
  );
}
