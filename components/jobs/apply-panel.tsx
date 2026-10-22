"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Button, { buttonVariants } from "@/components/_ui/button";
import { markJobApplied, prepareApplication, sendApplication } from "@/app/(crm)/jobs/actions";
import type { Prepared } from "@/lib/apply/outbox";
import type { JobItem } from "./jobs-board";

const CONTROL =
  "w-full rounded-lg border border-line-strong bg-secondary px-3 text-[14px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

type Props = { job: JobItem; onApplied: () => void; onError: (message: string) => void };

export default function ApplyPanel({ job, onApplied, onError }: Props) {
  const id = useId();
  const [p, setP] = useState<Prepared | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [anyway, setAnyway] = useState(false);
  const [note, setNote] = useState("Writing your letter for this job…");
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState<"sent" | "queued" | "applied" | null>(null);
  const [busy, start] = useTransition();
  const latest = useRef(0);
  const focusTo = (target: string) => requestAnimationFrame(() => document.getElementById(target)?.focus());

  function load(fresh = false) {
    const ticket = ++latest.current;
    start(async () => {
      setProblem("");
      setNote(fresh ? "Writing a new version…" : "Writing your letter for this job…");
      const r = await prepareApplication(job.id, fresh);
      // Only the newest request may change the panel.
      if (ticket !== latest.current) return;
      if (!r.ok) {
        setNote("");
        setProblem(r.error);
        return;
      }
      setP(r.p);
      setTo((t) => (fresh && t ? t : r.p.contact?.email ?? ""));
      setSubject(r.p.subject);
      setBody(r.p.body);
      if (r.p.outbox) setDone(r.p.outbox.status === "sent" ? "sent" : "queued");
      setNote(r.p.contact ? "Ready. Check the email, then send it." : "Ready. This job uses a form, so your apply kit is below.");
    });
  }

  // Prepares the application as soon as the panel opens, and moves focus here
  // because the Apply button that opened it is gone.
  useEffect(() => {
    load();
    focusTo(`${id}-title`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  function send() {
    if (busy || !p) return;
    if (!to.trim()) {
      setProblem("Enter the employer's email address in the Send to box.");
      document.getElementById(`${id}-to`)?.focus();
      return;
    }
    start(async () => {
      setProblem("");
      setNote("Sending from your Gmail…");
      const r = await sendApplication(job.id, { to, subject, body, anyway });
      if (!r.ok) {
        setNote("");
        setProblem(r.error);
        return;
      }
      setDone(r.status);
      setNote(r.note);
      focusTo(`${id}-done`);
      onApplied();
    });
  }

  function applied() {
    if (busy) return;
    start(async () => {
      const r = await markJobApplied(job.id);
      if (!r.ok) return onError(r.error);
      setDone("applied");
      setNote("Marked as applied and saved in your CRM.");
      focusTo(`${id}-done`);
      onApplied();
    });
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`${label} copied.`);
    } catch {
      setProblem(`Your browser blocked copying. Select the ${label.toLowerCase()} and copy it by hand.`);
    }
  }

  const canSend = Boolean(p?.mail.email && p.mail.tested && !p.problems.length && !done);

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <h3 id={`${id}-title`} tabIndex={-1} className="text-[16px] font-semibold outline-none">
        Apply to {job.company || "this job"}
      </h3>

      <p role="status" aria-live="polite" className="text-soft leading-normal empty:hidden">
        {note}
      </p>
      {problem && (
        <p role="alert" className="text-danger leading-normal">
          {problem}
        </p>
      )}

      {busy && !p && <div aria-hidden className="bg-secondary h-40 animate-pulse rounded-lg motion-reduce:animate-none" />}

      {p && (
        <>
          <p className="caption-style text-soft">
            {p.why.source === "ai" ? `The "why this company" lines were written by AI (${p.why.provider}) and checked against your Profile.` : p.why.note}{" "}
            <button type="button" onClick={() => load(true)} className="text-foreground focus-visible:ring-ring rounded underline underline-offset-2 outline-none focus-visible:ring-2">
              Write it again
            </button>
          </p>

          {p.problems.length > 0 && (
            <ul role="alert" className="flex list-disc flex-col gap-1 rounded-lg border border-(--tag-amber-border) bg-(--tag-amber-bg) p-3 pl-7 text-(--tag-amber-text)">
              {p.problems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}

          <div className="border-line-strong flex flex-col gap-3 rounded-xl border p-4">
            <h4 className="font-semibold">Send by email</h4>
            {!p.mail.email ? (
              <p className="leading-normal">
                Connect your Gmail first, so the app can send from your own address.{" "}
                <a href="/profile#gmail" className="underline underline-offset-2">
                  Connect Gmail in Profile
                </a>
              </p>
            ) : !p.mail.tested ? (
              <p className="leading-normal">
                Send yourself the test email first. It checks Gmail works before anything goes to an employer.{" "}
                <a href="/profile#gmail" className="underline underline-offset-2">
                  Send the test in Profile
                </a>
              </p>
            ) : null}

            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-to`} className="text-[14px] font-medium">
                Send to
              </label>
              <input id={`${id}-to`} type="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} aria-describedby={`${id}-to-hint`} className={`${CONTROL} h-11`} />
              <p id={`${id}-to-hint`} className="caption-style text-soft leading-normal">
                {p.contact ? <>Found in the post: &ldquo;{p.contact.sentence}&rdquo;</> : "The post gives no apply email. If you have a recruiter's address, type it here. Otherwise use the form kit below."}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-subject`} className="text-[14px] font-medium">
                Subject
              </label>
              <input id={`${id}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} className={`${CONTROL} h-11`} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-body`} className="text-[14px] font-medium">
                Email
              </label>
              <textarea id={`${id}-body`} rows={12} value={body} onChange={(e) => setBody(e.target.value)} className={`${CONTROL} resize-y py-2 leading-relaxed`} />
            </div>
            <p className="text-[14px]">
              Attached:{" "}
              <a href={`/api/jobs/${job.id}/cv`} target="_blank" rel="noopener" className="underline underline-offset-2">
                {p.attachment}
                <span className="sr-only"> (opens the PDF in a new tab)</span>
              </a>
            </p>
            {p.sendsLater && (
              <div className="flex flex-col gap-1">
                <p className="leading-normal">It&apos;s outside their work hours. It will send at {p.sendsLater}.</p>
                <label className="flex min-h-11 items-center gap-2 text-[14px]">
                  <input type="checkbox" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} className="accent-primary size-5" />
                  Send now anyway
                </label>
              </div>
            )}
            {done === "sent" || done === "queued" ? (
              <p id={`${id}-done`} tabIndex={-1} className="font-medium outline-none">
                {done === "sent" ? "Sent." : "Waiting to send."}{" "}
                <a href="/outbox" className="underline underline-offset-2">
                  See the Outbox
                </a>
              </p>
            ) : (
              <Button variant="primary" size="md" className="h-11 self-start px-5" onClick={send} aria-disabled={busy || !canSend}>
                {busy ? "Working…" : "Send application"}
              </Button>
            )}
          </div>

          <details open={!p.contact} className="border-line-strong rounded-xl border">
            <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer items-center px-4 font-semibold outline-none focus-visible:ring-2">Apply on their form</summary>
            <div className="flex flex-col gap-3 px-4 pb-4">
              <p className="text-soft leading-normal">Open the form, then copy each answer in. Your tailored CV is ready to upload.</p>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/jobs/${job.id}/cv`} download={p.attachment} className={buttonVariants({ variant: "secondary", size: "md", className: "h-11 px-4" })}>
                  Download the CV (PDF)
                </a>
                <a href={p.applyUrl} target="_blank" rel="noopener" className={buttonVariants({ variant: "secondary", size: "md", className: "h-11 px-4" })}>
                  Open the application form<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
              <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 text-[14px]">
                {(
                  [
                    ["Name", p.person.name],
                    ["Email", p.person.email],
                    ["Phone", p.person.phone],
                    ["Location", p.person.location],
                    ["LinkedIn", p.person.linkedin],
                    ["Portfolio", p.person.portfolio],
                    ["Why this company", p.why.why],
                    ["Cover letter", body],
                  ] as const
                ).map(([label, value]) =>
                  value ? (
                    <div key={label} className="contents">
                      <dt className="text-soft">{label}</dt>
                      <dd className="truncate">{value.split("\n")[0]}</dd>
                      <dd>
                        <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => copy(label, value)}>
                          Copy<span className="sr-only"> {label}</span>
                        </Button>
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
              {done === "applied" ? (
                <p id={`${id}-done`} tabIndex={-1} className="font-medium outline-none">
                  Marked as applied.
                </p>
              ) : (
                !done && (
                  <Button variant="secondary" size="md" className="h-11 self-start px-4" onClick={applied} aria-disabled={busy}>
                    I sent it on their form
                  </Button>
                )
              )}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
