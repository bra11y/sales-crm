"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Button from "@/components/_ui/button";
import { markJobApplied, prepareApplication, sendApplication } from "@/app/(crm)/jobs/actions";
import type { Prepared } from "@/lib/apply/outbox";
import { withReadLine } from "@/lib/apply/compose";
import ReadCheckBox from "@/components/apply/read-check";
import { readyChecks, readySummary } from "@/lib/apply/ready";
import { extensionVersion, noSubscribe, startWithExtension } from "./extension";
import type { JobItem } from "./jobs-board";

type Props = { job: JobItem; onApplied: () => void; onError: (message: string) => void };

export default function ApplyPanel({ job, onApplied, onError }: Props) {
  const id = useId();
  const [p, setP] = useState<Prepared | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [anyway, setAnyway] = useState(false);
  const [readOk, setReadOk] = useState(false);
  const [note, setNote] = useState("Writing your letter for this job…");
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState<"sent" | "queued" | "applied" | null>(null);
  const [busy, start] = useTransition();
  const latest = useRef(0);
  const extension = useSyncExternalStore(noSubscribe, extensionVersion, () => "");
  const [launched, setLaunched] = useState(false);
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
      setTo((t) => (fresh && t ? t : (r.p.contact?.email ?? "")));
      setSubject(r.p.subject);
      setBody(r.p.body);
      if (r.p.outbox) setDone(r.p.outbox.status === "sent" ? "sent" : "queued");
      setNote(r.p.contact ? "Ready. Check the email, then send it." : "Ready.");
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
    if (p.readCheck && !readOk) {
      setProblem('This post checks that you read it. Read it, then tick "I read the whole post" above.');
      return;
    }
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

  function applyWithExtension() {
    if (busy) return;
    start(async () => {
      setProblem("");
      setNote("Opening the application in a new tab…");
      const r = await startWithExtension(job.id);
      if (!r.ok) {
        setNote("");
        setProblem(r.error ?? "The extension did not start.");
        return;
      }
      setLaunched(true);
      setNote("A new tab opened. The panel at the bottom right walks you through it, and marks the job as applied when you finish.");
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

  const canSend = Boolean(p?.mail.email && p.mail.tested && !p.problems.length && !done && (!p.readCheck || readOk));

  function confirmRead(read: boolean, v: { word: string; tag: string }) {
    setReadOk(read && Boolean(v.word || v.tag));
    const strip = (t: string) =>
      t
        .split("\n")
        .filter((l) => !l.startsWith("P.S. I read the whole post"))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");
    setBody((b) => (read ? withReadLine(strip(b), v) : strip(b)));
    if (p?.readCheck?.subject && v.word) setSubject((s) => (read ? (s.includes(v.word) ? s : `${s} ${v.word}`) : s.replace(` ${v.word}`, "")));
    setNote(read ? "Added to your email, just above the sign-off." : "Taken out of your email.");
  }

  const emailJob = Boolean(p?.contact);
  const proof = p?.proof ?? [];

  const emailGroup = p && (
    <Group title="Send by email" id={`${id}-email`}>
      {!p.mail.email ? (
        <Row>
          <p className="leading-normal">
            Connect your Gmail first, so it sends from your own address.{" "}
            <a href="/profile#gmail" className="text-foreground underline underline-offset-2">
              Connect Gmail in Profile
            </a>
          </p>
        </Row>
      ) : !p.mail.tested ? (
        <Row>
          <p className="leading-normal">
            Send yourself the test email first.{" "}
            <a href="/profile#gmail" className="text-foreground underline underline-offset-2">
              Send the test in Profile
            </a>
          </p>
        </Row>
      ) : null}
      <Row>
        <label htmlFor={`${id}-to`} className="text-soft w-20 shrink-0 pt-2.5 text-[14px]">
          To
        </label>
        <div className="min-w-0 flex-1">
          <input id={`${id}-to`} type="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} aria-describedby={`${id}-to-hint`} className={LINE_INPUT} />
          <p id={`${id}-to-hint`} className="text-soft pt-1 text-[13px] leading-normal">
            {p.contact ? <>From the post: &ldquo;{p.contact.sentence}&rdquo;</> : "Only if you have a recruiter's address. The post gives none."}
          </p>
        </div>
      </Row>
      <Row>
        <label htmlFor={`${id}-subject`} className="text-soft w-20 shrink-0 pt-2.5 text-[14px]">
          Subject
        </label>
        <input id={`${id}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} className={`${LINE_INPUT} min-w-0 flex-1`} />
      </Row>
      <Row>
        <span className="text-soft w-20 shrink-0 text-[14px]">Attached</span>
        <a href={`/api/jobs/${job.id}/cv`} target="_blank" rel="noopener" className="min-w-0 truncate underline underline-offset-2">
          {p.attachment}
          <span className="sr-only"> (opens the PDF in a new tab)</span>
        </a>
      </Row>
      <details className="group">
        <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer items-center justify-between px-4 outline-none focus-visible:ring-2 focus-visible:ring-inset">
          Read or edit the email
          <span aria-hidden className="text-soft transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none">
            ›
          </span>
        </summary>
        <div className="px-4 pb-3">
          <label htmlFor={`${id}-body`} className="sr-only">
            Email
          </label>
          <textarea
            id={`${id}-body`}
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="border-line-strong bg-background/40 focus-visible:ring-ring w-full resize-y rounded-xl border p-3 text-[14px] leading-relaxed outline-none focus-visible:ring-2"
          />
        </div>
      </details>
      {p.sendsLater && (
        <Row>
          <label className="flex min-h-11 w-full items-center justify-between gap-3 text-[14px]">
            <span>Outside their work hours. Sends {p.sendsLater}.</span>
            <span className="flex items-center gap-2">
              Send now
              <input type="checkbox" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} className="accent-primary size-5" />
            </span>
          </label>
        </Row>
      )}
    </Group>
  );

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h3 id={`${id}-title`} tabIndex={-1} className="text-[22px] leading-tight font-semibold tracking-[-0.015em] outline-none">
          Apply to {job.company || "this job"}
        </h3>
        <p className="text-soft text-[14px]">{emailJob ? "This job takes applications by email." : p ? "This job uses an application form." : job.title}</p>
      </header>

      <p role="status" aria-live="polite" className="text-soft leading-normal empty:hidden">
        {note}
      </p>
      {problem && (
        <p role="alert" className="text-danger leading-normal">
          {problem}
        </p>
      )}

      {busy && !p && <div aria-hidden className="h-48 animate-pulse rounded-2xl bg-white/[0.04] motion-reduce:animate-none" />}

      {p && (
        <>
          {p.problems.length > 0 && (
            <ul role="alert" className="flex list-disc flex-col gap-1 rounded-2xl border border-(--tag-amber-border) bg-(--tag-amber-bg) p-4 pl-8 text-(--tag-amber-text)">
              {p.problems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}

          {p.readCheck && <ReadCheckBox check={p.readCheck} postUrl={p.applyUrl} onChange={confirmRead} />}

          <ReadyCheck job={job} p={p} extension={Boolean(extension)} id={`${id}-ready`} />

          <Group title="Proof that fits this job" id={`${id}-proof`} footer="Picked from Proof of work in your Profile. It goes in the email and the form answers.">
            {proof.length ? (
              proof.map((w) => (
                <Row key={w.title}>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">{w.title}</span>
                    <span className="text-soft text-[14px] leading-normal">{w.result}</span>
                  </div>
                  {w.url ? (
                    <a href={w.url} target="_blank" rel="noopener" className="text-foreground inline-flex min-h-11 shrink-0 items-center underline underline-offset-2">
                      Open<span className="sr-only"> {w.title} (opens in a new tab)</span>
                    </a>
                  ) : (
                    <a href="/profile#proof" className="text-soft inline-flex min-h-11 shrink-0 items-center text-[13px] underline underline-offset-2">
                      Add a link<span className="sr-only"> to {w.title} in Profile</span>
                    </a>
                  )}
                </Row>
              ))
            ) : (
              <Row>
                <p className="leading-normal">
                  No proof of work yet.{" "}
                  <a href="/profile#proof" className="text-foreground underline underline-offset-2">
                    Add your best work in Profile
                  </a>
                </p>
              </Row>
            )}
          </Group>

          {emailJob ? (
            <>
              {emailGroup}
              {done === "sent" || done === "queued" ? (
                <p id={`${id}-done`} tabIndex={-1} className="font-medium outline-none">
                  {done === "sent" ? "Sent." : "Waiting to send."}{" "}
                  <a href="/outbox" className="underline underline-offset-2">
                    See the Outbox
                  </a>
                </p>
              ) : (
                <Button variant="primary" size="md" className={PRIMARY} onClick={send} aria-disabled={busy || !canSend}>
                  {busy ? "Working…" : "Send application"}
                </Button>
              )}
            </>
          ) : (
            <>
              {extension ? (
                <Group title="Apply on their form" id={`${id}-form`}>
                  <Step n={1}>
                    <span>
                      Press <strong>Apply with the extension</strong>. Their form opens in a new tab.
                    </span>
                  </Step>
                  <Step n={2}>
                    <span>It finds the form, presses their Apply button if needed, and fills every page with your CV and answers.</span>
                  </Step>
                  <Step n={3}>
                    <span>You read each page and press Next or Submit. It never sends anything for you.</span>
                  </Step>
                  <Step n={4}>
                    <span>On the thank-you page it marks the job as applied here.</span>
                  </Step>
                </Group>
              ) : (
                <Group title="Apply on their form" id={`${id}-form`}>
                  <Step n={1}>
                    <span>
                      Add the Chrome extension once, and it does the rest for you.{" "}
                      <a href="/profile#extension" className="underline underline-offset-2">
                        Set it up
                      </a>
                    </span>
                  </Step>
                  <Step n={2}>
                    <a href={`/api/jobs/${job.id}/cv`} download={p.attachment} className="underline underline-offset-2">
                      Or download your CV for this job
                    </a>
                  </Step>
                  <Step n={3}>
                    <a href={p.applyUrl} target="_blank" rel="noopener" className="underline underline-offset-2">
                      and open the application form<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </Step>
                </Group>
              )}
              {done === "applied" ? (
                <p id={`${id}-done`} tabIndex={-1} className="font-medium outline-none">
                  Marked as applied and saved in your CRM.
                </p>
              ) : extension ? (
                <>
                  <Button variant={launched ? "secondary" : "primary"} size="md" className={PRIMARY} onClick={applyWithExtension} aria-disabled={busy}>
                    {launched ? "Open it again" : "Apply with the extension"}
                  </Button>
                  <Button variant="ghost" size="md" className="text-soft h-11 self-start px-2" onClick={applied} aria-disabled={busy}>
                    I already sent it: mark as applied
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="md" className={PRIMARY} onClick={applied} aria-disabled={busy}>
                  I sent it on their form
                </Button>
              )}

              <details className="group overflow-hidden rounded-2xl bg-white/[0.04]">
                <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer items-center justify-between px-4 font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset">
                  Copy answers by hand
                  <span aria-hidden className="text-soft transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none">
                    ›
                  </span>
                </summary>
                <dl className="divide-y divide-white/[0.08] border-t border-white/[0.08]">
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
                      <div key={label} className="flex min-h-11 items-center gap-3 px-4">
                        <dt className="text-soft w-28 shrink-0 text-[14px]">{label}</dt>
                        <dd className="min-w-0 flex-1 truncate text-[14px]">{value.split("\n")[0]}</dd>
                        <dd>
                          <Button variant="ghost" size="md" className="h-11 px-3" onClick={() => copy(label, value)}>
                            Copy<span className="sr-only"> {label}</span>
                          </Button>
                        </dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </details>

              <details className="group">
                <summary className="text-soft focus-visible:ring-ring inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-[14px] outline-none focus-visible:ring-2">
                  Have a recruiter&apos;s email? Send it by email instead
                </summary>
                <div className="flex flex-col gap-3 pt-2">
                  {emailGroup}
                  {done !== "applied" && (
                    <Button variant="secondary" size="md" className={PRIMARY} onClick={send} aria-disabled={busy || !canSend}>
                      Send application by email
                    </Button>
                  )}
                </div>
              </details>
            </>
          )}

          <p className="text-soft text-[13px] leading-normal">
            {p.why.source === "ai" ? `The "why this company" lines were written by AI (${p.why.provider}) and checked against your Profile. Everything else comes from your Profile.` : p.why.note}{" "}
            <button type="button" onClick={() => load(true)} className="text-foreground focus-visible:ring-ring rounded underline underline-offset-2 outline-none focus-visible:ring-2">
              Write it again
            </button>
          </p>
        </>
      )}
    </section>
  );
}

const MARK = {
  yes: { icon: "✓", label: "Ready", cls: "bg-(--tag-green-bg) text-(--tag-green-text)" },
  warn: { icon: "!", label: "Check", cls: "bg-(--tag-amber-bg) text-(--tag-amber-text)" },
  no: { icon: "×", label: "Fix", cls: "bg-danger/15 text-danger" },
};

// One look before you apply: where you can work, pay, freshness, CV match, profile and sending.
function ReadyCheck({ job, p, extension, id }: { job: JobItem; p: Prepared; extension: boolean; id: string }) {
  const checks = readyChecks(job, { person: p.person, proof: p.proof, problems: p.problems, byEmail: Boolean(p.contact), mail: p.mail, extension, minMonthlyUsd: p.minMonthlyUsd });
  const blocked = checks.some((c) => c.state === "no");
  return (
    <Group title={`Ready check: ${readySummary(checks)}`} id={id} footer={blocked ? "You can still apply. Fixing these first gives you a better chance." : undefined}>
      {checks.map((c) => (
        <div key={c.text} className="flex min-h-11 items-start gap-3 px-4 py-2.5">
          <span aria-hidden className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${MARK[c.state].cls}`}>
            {MARK[c.state].icon}
          </span>
          <span className="sr-only">{MARK[c.state].label}:</span>
          <span className="min-w-0 flex-1 text-[14px] leading-normal">{c.text}</span>
          {c.fix && (
            <a href={c.fix.href} className="text-foreground inline-flex min-h-6 shrink-0 items-center text-[14px] underline underline-offset-2">
              {c.fix.label}
            </a>
          )}
        </div>
      ))}
      <div className="flex min-h-11 items-center gap-3 px-4 py-2.5">
        <span className="min-w-0 flex-1 text-[14px] leading-normal">Your CV for this job, with clickable LinkedIn and Portfolio links</span>
        <a href={`/api/jobs/${job.id}/cv`} target="_blank" rel="noopener" className="text-foreground inline-flex min-h-6 shrink-0 items-center text-[14px] underline underline-offset-2">
          Preview<span className="sr-only"> your CV (opens the PDF in a new tab)</span>
        </a>
      </div>
    </Group>
  );
}

// Apple-style inset grouped list: a small heading, rows with hairline dividers, an optional footnote.
const LINE_INPUT = "w-full border-0 border-b border-b-[#6b6b6b] bg-transparent py-2 text-[15px] outline-none focus-visible:border-b-ring focus-visible:ring-2 focus-visible:ring-ring rounded-none";
const PRIMARY = "h-12 w-full rounded-xl text-[16px] font-semibold transition-transform duration-100 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

function Group({ title, id, footer, children }: { title: string; id: string; footer?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1.5">
      <h4 id={id} className="text-soft px-4 text-[13px] font-medium">
        {title}
      </h4>
      <div className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.04]">{children}</div>
      {footer && <p className="text-soft px-4 text-[13px] leading-normal">{footer}</p>}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-11 items-start gap-3 px-4 py-2.5">{children}</div>;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-4 py-2.5">
      <span aria-hidden className="bg-foreground text-background flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums">
        {n}
      </span>
      <span className="sr-only">Step {n}:</span>
      {children}
    </div>
  );
}
