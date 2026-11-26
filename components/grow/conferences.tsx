"use client";

import { type FormEvent, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { addConference, addSharedOnX, draftConferenceAnswers, findConferencesNow, saveQuestions, updateConference } from "@/app/(crm)/conferences-actions";
import { type Conference, CONFERENCE_STATUS_LABEL, CONFERENCE_STATUSES, type Question } from "@/lib/conferences/conferences";
import { dueText } from "@/lib/grow/grow";
import { cn } from "@/lib/utils";

const FIELD = "w-full rounded-xl border border-line-strong bg-secondary px-3 h-11 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";
const AREA = "w-full rounded-xl border border-line-strong bg-secondary px-3 py-2.5 text-[15px] leading-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";
const CARD = "flex min-w-0 flex-col gap-3 rounded-2xl bg-white/[0.04] p-5";
const LINK = "text-foreground inline-flex min-h-11 items-center underline underline-offset-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring";
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function Status({ text, error, id }: { text: string; error: string; id: string }) {
  return (
    <>
      <p role="status" aria-live="polite" className="text-soft empty:hidden">
        {text}
      </p>
      {error && (
        <p id={id} role="alert" className="text-danger">
          {error}
        </p>
      )}
    </>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  function run(work: () => Promise<{ ok: boolean; error?: string; note?: string }>, done: string) {
    if (pending) return;
    start(async () => {
      const r = await work();
      if (!r.ok) {
        setError(r.error ?? "That did not work. Try again.");
        setStatus("");
        return;
      }
      setError("");
      setStatus(r.note ?? done);
      router.refresh();
    });
  }
  return { pending, start, status, setStatus, error, setError, run, router };
}

function Facts({ c, now }: { c: Conference; now: string }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
      {(c.place || c.dates) && (
        <>
          <dt className="text-soft">Where, when</dt>
          <dd className="break-words">{[c.place, c.dates].filter(Boolean).join(" · ")}</dd>
        </>
      )}
      <dt className="text-soft">Deadline</dt>
      <dd className="break-words">{c.deadline ? `${c.deadline} · ${dueText(c.deadline, new Date(now))}${c.deadline_text ? ` · ${c.deadline_text}` : ""}` : c.deadline_text || "Check the page"}</dd>
      <dt className="text-soft">Fee to apply</dt>
      <dd className="break-words font-medium">{c.fee || "None found on the page. Check before you submit."}</dd>
      {c.covers && (
        <>
          <dt className="text-soft">Covers</dt>
          <dd className="break-words">{c.covers}</dd>
        </>
      )}
      {c.eligible && (
        <>
          <dt className="text-soft">Who can apply</dt>
          <dd className="break-words">{c.eligible}</dd>
        </>
      )}
    </dl>
  );
}

function Warnings({ list, id }: { list: string[]; id: string }) {
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-amber-300/50 p-3">
      <h4 id={id} className="text-[14px] font-semibold">
        Check before you pay
      </h4>
      <ul aria-labelledby={id} className="flex list-disc flex-col gap-0.5 pl-5 text-[14px] leading-normal">
        {list.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function ConferenceFinder({ items, sources, now, sharedLeft }: { items: Conference[]; sources: Record<string, string>; now: string; sharedLeft: number }) {
  const id = useId();
  const { pending, start, status, setStatus, error, setError, run, router } = useRun();

  function findNow() {
    if (pending) return;
    setStatus("Searching opportunity sites. This takes about 30 seconds.");
    start(async () => {
      const r = await findConferencesNow();
      if (!r.ok) {
        setError(r.error);
        setStatus("");
        return;
      }
      setError("");
      const skipped = r.errors.length ? ` ${r.errors.length} site${r.errors.length === 1 ? "" : "s"} did not answer.` : "";
      setStatus(r.added ? `${r.added} new conference${r.added === 1 ? "" : "s"} found.${skipped}` : `No new conferences since the last search.${skipped}`);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby={`${id}-h`} aria-busy={pending} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
            Found for you <span className="text-soft font-normal tabular-nums">{items.length}</span>
          </h2>
          <p className="text-soft text-[14px]">The search also runs by itself every morning. Closed ones are hidden.</p>
        </div>
        <Button type="button" variant="primary" size="md" onClick={findNow} aria-disabled={pending} className="h-11 rounded-xl px-5 text-[15px]">
          {pending ? "Searching…" : "Find conferences now"}
        </Button>
      </div>
      {sharedLeft > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] p-5">
          <p className="leading-normal">
            {sharedLeft} funded conference{sharedLeft === 1 ? "" : "s"} shared on X by @Web3empresss on 26 November, with deadlines on 29 and 30 November. Each was checked on the organiser&rsquo;s page, and each one charges a fee to apply.
          </p>
          <Button type="button" variant="secondary" size="md" aria-disabled={pending} onClick={() => run(addSharedOnX, "Added.")} className="h-11 self-start rounded-xl px-4">
            Add them to my list
          </Button>
        </div>
      )}
      <Status text={status} error={error} id={`${id}-err`} />
      {items.length === 0 ? (
        <p className="text-soft rounded-2xl bg-white/[0.04] p-5 leading-normal">Nothing yet. Press Find conferences now, or add one you saw on the Add tab.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((c) => (
            <li key={c.id} className={CARD}>
              <p className="text-soft text-[13px]">{sources[c.source] ?? c.source}</p>
              <h3 className="text-[17px] leading-snug font-semibold break-words">
                <a href={c.url} target="_blank" rel="noopener" className="underline-offset-2 hover:underline focus-visible:underline">
                  {c.name}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </h3>
              <Facts c={c} now={now} />
              <Warnings list={c.warnings} id={`${id}-${c.id}-w`} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="md" aria-disabled={pending} onClick={() => run(() => updateConference(c.id, { status: "interested" }), `${c.name} moved to Tracking.`)} className="h-11 rounded-xl px-4">
                  Go for it
                </Button>
                <Button type="button" variant="ghost" size="md" aria-disabled={pending} onClick={() => run(() => updateConference(c.id, { status: "dismissed" }), `${c.name} removed from the list.`)} className="text-soft hover:text-foreground h-11 rounded-xl px-4">
                  Not for me
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Answer({ q, i, id, onChange, onBlur }: { q: Question; i: number; id: string; onChange: (a: string) => void; onBlur: () => void }) {
  const n = words(q.answer);
  const over = q.limit ? n > q.limit : false;
  const [copied, setCopied] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(q.answer);
      setCopied("Answer copied. Paste it into the form.");
    } catch {
      setCopied("Copy did not work. Select the text and copy it.");
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-a${i}`} className="text-[15px] font-medium leading-snug">
        {q.q}
      </label>
      <textarea id={`${id}-a${i}`} value={q.answer} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} rows={6} maxLength={4000} aria-invalid={over || undefined} aria-describedby={`${id}-n${i}`} className={AREA} />
      <p id={`${id}-n${i}`} className={cn("text-[13px]", over ? "text-danger" : "text-soft")}>
        {n} words{q.limit ? ` of ${q.limit}${over ? `. Cut ${n - q.limit} words before you paste it.` : ""}` : ""}
        {q.note ? ` · ${q.source === "ai" ? `Drafted by AI (${q.note}) and checked against your Profile. Read it and make it yours.` : q.note}` : ""}
      </p>
      {q.answer && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="md" onClick={copy} className="text-soft hover:text-foreground h-11 self-start rounded-xl px-3">
            Copy answer
          </Button>
          <p role="status" aria-live="polite" className="text-soft text-[13px] empty:hidden">
            {copied}
          </p>
        </div>
      )}
    </div>
  );
}

function ConferenceCard({ c, now }: { c: Conference; now: string }) {
  const id = useId();
  const { pending, status, setStatus, error, setError, run, start, router } = useRun();
  const [questions, setQuestions] = useState<Question[]>(c.questions);
  const server = JSON.stringify(c.questions);
  const [seen, setSeen] = useState(server);
  if (server !== seen) {
    setSeen(server);
    if (JSON.stringify(questions) === seen) setQuestions(c.questions);
  }
  const [note, setNote] = useState(c.note ?? "");
  const [newQ, setNewQ] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [qMissing, setQMissing] = useState(false);
  const dirty = JSON.stringify(questions) !== server;

  function edit(i: number, answer: string) {
    setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, answer, source: "you" as const, note: undefined } : q)));
  }

  function draft() {
    if (pending) return;
    setStatus("Drafting your answers from your Profile. This takes up to a minute.");
    start(async () => {
      if (dirty) {
        const s = await saveQuestions(c.id, questions);
        if (!s.ok) return setError(s.error);
      }
      const r = await draftConferenceAnswers(c.id);
      if (!r.ok) {
        setError(r.error);
        setStatus("");
        return;
      }
      setError("");
      setStatus(r.note ?? "Answers drafted.");
      router.refresh();
    });
  }

  function addQuestion(e: FormEvent) {
    e.preventDefault();
    const q = newQ.trim();
    if (!q) {
      setError("Type the question the form asks.");
      setQMissing(true);
      document.getElementById(`${id}-newq`)?.focus();
      return;
    }
    setQMissing(false);
    const limit = Number(newLimit);
    const next = [...questions, { q, limit: Number.isFinite(limit) && limit > 0 ? limit : null, answer: "" }];
    setQuestions(next);
    setNewQ("");
    setNewLimit("");
    run(() => saveQuestions(c.id, next), "Question added.");
  }

  return (
    <li id={`c-${c.id}`} className={CARD} aria-busy={pending}>
      <h3 className="text-[17px] leading-snug font-semibold break-words">
        <a href={c.url} target="_blank" rel="noopener" className="underline-offset-2 hover:underline focus-visible:underline">
          {c.name}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </h3>
      <Facts c={c} now={now} />
      <Warnings list={c.warnings} id={`${id}-w`} />
      <div className="flex flex-col gap-1.5 sm:max-w-[20em]">
        <label htmlFor={`${id}-stage`} className="text-[14px] font-medium">
          Stage
        </label>
        <select id={`${id}-stage`} value={c.status} onChange={(e) => run(() => updateConference(c.id, { status: e.target.value }), `Moved to ${CONFERENCE_STATUS_LABEL[e.target.value as Conference["status"]]}.`)} className={cn(FIELD, "cursor-pointer")}>
          {CONFERENCE_STATUSES.filter((s) => s !== "found").map((s) => (
            <option key={s} value={s}>
              {CONFERENCE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <section aria-labelledby={`${id}-qh`} className="flex flex-col gap-3 border-t border-line-strong pt-3">
        <h4 id={`${id}-qh`} className="text-[15px] font-semibold">
          Your answers <span className="text-soft font-normal tabular-nums">{questions.filter((q) => q.answer).length} of {questions.length}</span>
        </h4>
        {questions.map((q, i) => (
          <Answer key={`${i}-${q.q}`} q={q} i={i} id={id} onChange={(a) => edit(i, a)} onBlur={() => dirty && run(() => saveQuestions(c.id, questions), "Answer saved.")} />
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="md" aria-disabled={pending || !questions.length} onClick={draft} className="h-11 rounded-xl px-4">
            {questions.some((q) => q.answer) ? "Draft again (keeps your edits)" : "Draft my answers"}
          </Button>
          {dirty && (
            <Button type="button" variant="secondary" size="md" aria-disabled={pending} onClick={() => run(() => saveQuestions(c.id, questions), "Answers saved.")} className="h-11 rounded-xl px-4">
              Save my edits
            </Button>
          )}
          {c.apply_url && (
            <a href={c.apply_url} target="_blank" rel="noopener" className={LINK}>
              Open the application form<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
        <p className="text-soft text-[13px] leading-normal">Answers you edit are kept when you draft again. The app never pays a fee or presses Submit: you do both on their form, then set the stage to Applied.</p>
        <form onSubmit={addQuestion} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8em_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-newq`} className="text-[14px] font-medium">
              Add a question the form asks
            </label>
            <input id={`${id}-newq`} value={newQ} onChange={(e) => setNewQ(e.target.value)} maxLength={300} aria-invalid={qMissing && error ? true : undefined} aria-describedby={qMissing && error ? `${id}-err` : undefined} className={FIELD} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-newl`} className="text-[14px] font-medium">
              Word limit
            </label>
            <input id={`${id}-newl`} value={newLimit} onChange={(e) => setNewLimit(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={FIELD} />
          </div>
          <Button type="submit" variant="secondary" size="md" aria-disabled={pending} className="h-11 rounded-xl px-4">
            Add question
          </Button>
        </form>
      </section>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-[14px] font-medium">
          Notes
        </label>
        <textarea id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className={AREA} />
        <Button type="button" variant="ghost" size="md" aria-disabled={pending} onClick={() => run(() => updateConference(c.id, { note }), "Notes saved.")} className="text-soft hover:text-foreground h-11 self-start rounded-xl px-3">
          Save notes
        </Button>
      </div>
      <Status text={status} error={error} id={`${id}-err`} />
    </li>
  );
}

export function ConferenceTracker({ list, now }: { list: Conference[]; now: string }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h2 id={`${id}-h`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
        Tracking <span className="text-soft font-normal tabular-nums">{list.length}</span>
      </h2>
      <p className="text-soft px-1 leading-normal">Draft your answers here, then open the form, paste them in, pay any fee yourself, and submit. Deadlines in the next 5 days are in your morning email.</p>
      {list.length === 0 ? (
        <p className="text-soft rounded-2xl bg-white/[0.04] p-5 leading-normal">
          Nothing yet. Press Go for it on a found conference, or add one on the{" "}
          <a href="/conferences?view=add" className="text-foreground underline underline-offset-2">
            Add
          </a>{" "}
          tab.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {list.map((c) => (
            <ConferenceCard key={c.id} c={c} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AddConference() {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, start, status, setStatus, error, setError, router } = useRun();
  const [bad, setBad] = useState<"name" | "url" | null>(null);
  const invalid = (f: "name" | "url") => (error && bad === f ? { "aria-invalid": true, "aria-describedby": `${id}-err` } : {});

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    start(async () => {
      const r = await addConference(form);
      if (!r.ok) {
        setError(r.error);
        setStatus("");
        setBad(r.field ?? null);
        document.getElementById(`${id}-${r.field ?? "name"}`)?.focus();
        return;
      }
      setError("");
      setBad(null);
      setStatus(`${form.get("name")} added to Tracking.`);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
      <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
        Add a conference you saw
      </h2>
      <p className="text-soft leading-normal">From X, WhatsApp or a friend. Paste the form&rsquo;s questions, one on each line, and the app drafts your answers.</p>
      <form ref={formRef} onSubmit={add} aria-busy={pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-name`} className="text-[15px] font-medium">
            Name (required)
          </label>
          <input id={`${id}-name`} name="name" required maxLength={200} {...invalid("name")} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-url`} className="text-[15px] font-medium">
            Link to the conference page (required)
          </label>
          <input id={`${id}-url`} name="url" type="url" inputMode="url" required placeholder="https://" {...invalid("url")} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-place`} className="text-[15px] font-medium">
            City and country
          </label>
          <input id={`${id}-place`} name="place" maxLength={120} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-dates`} className="text-[15px] font-medium">
            Event dates
          </label>
          <input id={`${id}-dates`} name="dates" maxLength={120} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-deadline`} className="text-[15px] font-medium">
            Deadline
          </label>
          <input id={`${id}-deadline`} name="deadline" type="date" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-fee`} className="text-[15px] font-medium">
            Fee to apply, if any
          </label>
          <input id={`${id}-fee`} name="fee" maxLength={200} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-q`} className="text-[15px] font-medium">
            The form&rsquo;s questions
          </label>
          <textarea id={`${id}-q`} name="questions" rows={4} maxLength={3000} aria-describedby={`${id}-qhint`} className={AREA} />
          <p id={`${id}-qhint`} className="text-soft text-[13px]">
            One question on each line. Add the word limit in brackets at the end, like: Why do you want to attend? (250 words)
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" size="md" aria-disabled={pending} className="h-12 rounded-xl px-6 text-[15px] sm:self-start">
            {pending ? "Saving…" : "Add conference"}
          </Button>
          <Status text={status} error={error} id={`${id}-err`} />
        </div>
      </form>
    </section>
  );
}
