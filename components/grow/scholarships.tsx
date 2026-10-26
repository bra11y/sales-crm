"use client";

import { type FormEvent, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { addScholarship, removeScholarship, startApplication, updateScholarship } from "@/app/(crm)/grow-actions";
import { daysLeft, dueText, LEVEL_LABEL, LEVELS, type Scholarship, STATUS_LABEL, STATUSES } from "@/lib/grow/grow";
import { DOC_LABEL, type DocKind, readiness, SCHOLARSHIP_NEEDS } from "@/lib/grow/documents";
import Checklist from "./checklist";
import { cn } from "@/lib/utils";

const FIELD = "w-full rounded-xl border border-line-strong bg-secondary px-3 h-11 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

// part "add" is the form on the Add tab; part "list" is the Tracking tab.
export default function Scholarships({ list, have, now, part }: { list: Scholarship[]; have: DocKind[]; now: string; part: "add" | "list" }) {
  const id = useId();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    start(async () => {
      const r = await addScholarship(form);
      if (!r.ok) {
        setError(r.error);
        setStatus("");
        document.getElementById(`${id}-name`)?.focus();
        return;
      }
      setError("");
      setStatus(`${form.get("name")} added, with a starting checklist.`);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {part === "add" && (
        <section aria-labelledby={`${id}-add`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
          <h2 id={`${id}-add`} className="text-[20px] font-semibold tracking-[-0.015em]">
            Add a scholarship
          </h2>
          <form ref={formRef} onSubmit={add} aria-busy={pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor={`${id}-name`} className="text-[15px] font-medium">
                Name (required)
              </label>
              <input id={`${id}-name`} name="name" required maxLength={200} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} className={FIELD} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor={`${id}-url`} className="text-[15px] font-medium">
                Link to the official page
              </label>
              <input id={`${id}-url`} name="url" type="url" inputMode="url" placeholder="https://" className={FIELD} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-deadline`} className="text-[15px] font-medium">
                Deadline
              </label>
              <input id={`${id}-deadline`} name="deadline" type="date" className={FIELD} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-level`} className="text-[15px] font-medium">
                Level
              </label>
              <select id={`${id}-level`} name="level" defaultValue="any" className={cn(FIELD, "cursor-pointer")}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-country`} className="text-[15px] font-medium">
                Country
              </label>
              <input id={`${id}-country`} name="country" maxLength={100} autoComplete="off" className={FIELD} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-amount`} className="text-[15px] font-medium">
                What it pays
              </label>
              <input id={`${id}-amount`} name="amount" maxLength={120} placeholder="Full tuition and living costs" className={FIELD} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor={`${id}-provider`} className="text-[15px] font-medium">
                Who gives it
              </label>
              <input id={`${id}-provider`} name="provider" maxLength={200} autoComplete="organization" className={FIELD} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Button type="submit" variant="primary" size="md" aria-disabled={pending} className="h-12 rounded-xl px-6 text-[15px] sm:self-start">
                {pending ? "Saving…" : "Add scholarship"}
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
      )}

      {part === "list" && (
        <section aria-labelledby={`${id}-list`} className="flex flex-col gap-3">
          <h2 id={`${id}-list`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
            Tracking <span className="text-soft font-normal tabular-nums">{list.length}</span>
          </h2>
          {list.length === 0 ? (
            <p className="text-soft rounded-2xl bg-white/[0.04] p-5 leading-normal">
              Nothing yet. Open one on the{" "}
              <a href="/scholarships" className="text-foreground underline underline-offset-2">
                For you
              </a>{" "}
              tab and press Track this.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {list.map((s) => (
                <Card key={s.id} s={s} have={have} now={now} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Card({ s, have, now }: { s: Scholarship; have: DocKind[]; now: string }) {
  const id = useId();
  const router = useRouter();
  const [stage, setStage] = useState(s.status);
  const [msg, setMsg] = useState("");
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const left = daysLeft(s.deadline, new Date(now));
  const open = s.status !== "won" && s.status !== "lost";
  const urgent = open && left !== null && left >= 0 && left <= 14;

  function move(next: string) {
    const before = stage;
    setStage(next as Scholarship["status"]);
    start(async () => {
      const r = await updateScholarship(s.id, { status: next });
      setMsg(r.ok ? `Moved to ${STATUS_LABEL[next as Scholarship["status"]]}.` : r.error);
      if (!r.ok) setStage(before);
    });
  }

  function begin() {
    if (pending) return;
    start(async () => {
      setMsg("Starting your application…");
      const r = await startApplication({ scholarshipId: s.id });
      setMsg(r.ok ? "Started. Your checklist is updated and a statement draft is below." : r.error);
      if (r.ok) {
        setStage("preparing");
        router.refresh();
      }
    });
  }

  function remove() {
    start(async () => {
      const r = await removeScholarship(s.id);
      if (!r.ok) setMsg(r.error);
      else router.refresh();
    });
  }

  return (
    <li aria-labelledby={`${id}-n`} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={`${id}-n`} className="text-[17px] leading-snug font-semibold break-words">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">
                {s.name}
                <span className="sr-only"> (official page, opens in a new tab)</span>
              </a>
            ) : (
              s.name
            )}
          </h3>
          <p className="text-soft text-[14px] break-words">{[s.provider, LEVEL_LABEL[s.level], s.country].filter(Boolean).join(" · ")}</p>
          {s.amount && <p className="text-[14px] break-words">{s.amount}</p>}
        </div>
        <p className={cn("rounded-md px-2 py-1 text-[13px] font-medium tabular-nums", urgent ? "bg-(--tag-amber-bg) text-(--tag-amber-text)" : "text-soft bg-white/[0.06]")}>
          {dueText(s.deadline, new Date(now))}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-stage`} className="text-soft text-[13px]">
            Stage
          </label>
          <select id={`${id}-stage`} value={stage} onChange={(e) => move(e.target.value)} className={cn(FIELD, "w-auto cursor-pointer pr-8")}>
            {STATUSES.map((x) => (
              <option key={x} value={x}>
                {STATUS_LABEL[x]}
              </option>
            ))}
          </select>
        </div>
        {/* Removing is two presses, so one slip never deletes your notes. */}
        {sure ? (
          <>
            <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-3" onClick={remove}>
              Yes, remove {s.name}
            </Button>
            <Button type="button" variant="ghost" size="md" className="h-11 px-3" onClick={() => setSure(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => setSure(true)}>
            Remove<span className="sr-only"> {s.name}</span>
          </Button>
        )}
      </div>
      {open && stage === "interested" && (
        <div className="flex flex-col gap-1">
          <Button type="button" variant="primary" size="md" className="h-11 self-start rounded-xl px-4" aria-disabled={pending} onClick={begin}>
            Start my application
          </Button>
          <p className="text-soft text-[13px]">Builds your checklist from what it asks for and writes a first draft of your personal statement.</p>
        </div>
      )}
      {open && <DocsLine have={have} />}
      {/* A new checklist from "Start my application" replaces the old one on screen. */}
      <Checklist key={s.steps.map((x) => x.text).join("|")} label={`Checklist for ${s.name}`} initial={s.steps} save={(steps) => updateScholarship(s.id, { steps })} />
      {s.statement && <Statement id={s.id} name={s.name} initial={s.statement} />}
      <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
        {msg}
      </p>
    </li>
  );
}

// Your personal statement draft: edit it here, then copy it into the application form.
function Statement({ id, name, initial }: { id: string; name: string; initial: string }) {
  const field = useId();
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const blanks = (text.match(/\[[^\]]+\]/g) ?? []).length;
  return (
    <details className="rounded-xl bg-white/[0.03] p-3" open={blanks > 0}>
      <summary className="focus-visible:ring-ring min-h-6 cursor-pointer rounded font-medium outline-none focus-visible:ring-2">
        Personal statement{" "}
        <span className="text-soft font-normal">
          · {words} words{blanks ? ` · ${blanks} parts in [brackets] for you to write` : ""}
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <label htmlFor={field} className="text-soft text-[13px]">
          Statement for {name}. Replace each part in [square brackets] with your own words.
        </label>
        <textarea id={field} value={text} onChange={(e) => setText(e.target.value)} rows={14} className={cn(FIELD, "h-auto py-3 leading-relaxed")} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="h-11 rounded-xl px-4"
            aria-disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateScholarship(id, { statement: text });
                setMsg(r.ok ? "Saved." : r.error);
              })
            }
          >
            Save statement
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="h-11 px-3"
            onClick={() =>
              navigator.clipboard.writeText(text).then(
                () => setMsg(blanks ? `Copied. ${blanks} parts in brackets still need your words.` : "Copied."),
                () => setMsg("Copy did not work. Select the text and copy it."),
              )
            }
          >
            Copy
          </Button>
        </div>
        <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
          {msg}
        </p>
      </div>
    </details>
  );
}

// Which of the usual documents are ready, with a link to upload the first one missing.
function DocsLine({ have }: { have: DocKind[] }) {
  const r = readiness(
    have.map((kind) => ({ kind, expires_on: null })),
    SCHOLARSHIP_NEEDS,
  );
  if (!r.missing.length) return <p className="text-success text-[14px]">All the usual documents are in Documents.</p>;
  return (
    <p className="text-[14px] leading-normal">
      Documents: {r.have.length} of {SCHOLARSHIP_NEEDS.length} ready.{" "}
      <a href={`/documents?need=${r.missing[0]}`} className="underline underline-offset-2">
        Upload your {DOC_LABEL[r.missing[0]].toLowerCase()}
      </a>
      {r.missing.length > 1 ? ` and ${r.missing.length - 1} more` : ""}.
    </p>
  );
}
