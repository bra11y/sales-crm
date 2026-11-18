"use client";

import { type FormEvent, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { addGrant, dismissGrantLead, findGrantsNow, removeAnswer, removeGrant, saveAnswer, trackGrantLead, updateGrant } from "@/app/(crm)/grants-actions";
import { type Grant, type GrantAnswer, type GrantFit, GRANT_STATUS_LABEL, GRANT_STATUSES } from "@/lib/grants/grants";
import { dueText } from "@/lib/grow/grow";
import { cn } from "@/lib/utils";

const FIELD = "w-full rounded-xl border border-line-strong bg-secondary px-3 h-11 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";
const AREA = "w-full rounded-xl border border-line-strong bg-secondary px-3 py-2.5 text-[15px] leading-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";
const CARD = "flex min-w-0 flex-col gap-3 rounded-2xl bg-white/[0.04] p-5";
const BAND: Record<GrantFit["band"], string> = { strong: "Strong fit", good: "Good fit", maybe: "Maybe" };

export type FoundGrantItem = GrantFit & {
  id: string;
  title: string;
  url: string;
  eligible: string | null;
  amount: string | null;
  deadline: string | null;
  deadline_text: string | null;
  source: string;
  summary: string | null;
  tracked_id: string | null;
};

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

export function GrantFinder({ items, sources, now, lastFound }: { items: FoundGrantItem[]; sources: Record<string, string>; now: string; lastFound: string | null }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showHidden, setShowHidden] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const shown = items.filter((i) => showHidden || !i.hidden);
  const hiddenCount = items.filter((i) => i.hidden).length;

  function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    if (pending) return;
    start(async () => {
      const r = await work();
      if (!r.ok) {
        setError(r.error ?? "That did not work. Try again.");
        setStatus("");
        return;
      }
      setError("");
      setStatus(done);
      router.refresh();
    });
  }

  function findNow() {
    if (pending) return;
    setStatus("Searching grant sites. This takes about 30 seconds.");
    start(async () => {
      const r = await findGrantsNow();
      if (!r.ok) {
        setError(r.error);
        setStatus("");
        return;
      }
      setError("");
      const skipped = r.errors.length ? ` ${r.errors.length} site${r.errors.length === 1 ? "" : "s"} did not answer.` : "";
      setStatus(r.added ? `${r.added} new grant${r.added === 1 ? "" : "s"} found.${skipped}` : `No new grants since the last search.${skipped}`);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby={`${id}-h`} aria-busy={pending} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
            Found for your business <span className="text-soft font-normal tabular-nums">{shown.length}</span>
          </h2>
          <p className="text-soft text-[14px]">
            {lastFound ? `Last new grant ${new Date(lastFound).toLocaleDateString("en-NG", { day: "numeric", month: "long" })}.` : "No search yet."} The search also runs by itself every morning.
          </p>
        </div>
        <Button type="button" variant="primary" size="md" onClick={findNow} aria-disabled={pending} className="h-11 rounded-xl px-5 text-[15px]">
          {pending ? "Searching…" : "Find grants now"}
        </Button>
      </div>
      {hiddenCount > 0 && (
        <label className="flex min-h-11 items-center gap-2 self-start text-[15px]">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="size-5 accent-[var(--color-primary)]" />
          Show {hiddenCount} grant{hiddenCount === 1 ? "" : "s"} you probably can&rsquo;t get
        </label>
      )}
      <Status text={status} error={error} id={`${id}-err`} />
      {shown.length === 0 ? (
        <p className="text-soft rounded-2xl bg-white/[0.04] p-5 leading-normal">Nothing yet. Press Find grants now, or add one you saw on the Add tab.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((g) => (
            <li key={g.id} className={cn(CARD, g.hidden && "outline-line-strong outline-1 -outline-offset-1 outline-dashed")}>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className={cn("rounded-full px-2.5 py-1 font-medium", g.hidden ? "bg-white/10" : g.band === "strong" ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10")}>
                  {g.hidden ? `Hidden: ${g.hidden}` : `${g.score} · ${BAND[g.band]}`}
                </span>
                <span className="text-soft">{sources[g.source] ?? g.source}</span>
              </div>
              <h3 className="text-[17px] leading-snug font-semibold break-words">
                <a href={g.url} target="_blank" rel="noopener" className="underline-offset-2 hover:underline focus-visible:underline">
                  {g.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
                <dt className="text-soft">Pays</dt>
                <dd>{g.amount || "Not stated"}</dd>
                <dt className="text-soft">Deadline</dt>
                <dd>{g.deadline ? `${g.deadline} · ${dueText(g.deadline, new Date(now))}` : g.deadline_text || "Check the page"}</dd>
                {g.eligible && (
                  <>
                    <dt className="text-soft">Who can apply</dt>
                    <dd className="break-words">{g.eligible}</dd>
                  </>
                )}
              </dl>
              {g.reasons.length > 0 && (
                <ul className="text-soft flex list-disc flex-col gap-0.5 pl-5 text-[14px]">
                  {g.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {g.tracked_id ? (
                  <a href="/grants?view=tracking" className="text-foreground inline-flex min-h-11 items-center underline underline-offset-2">
                    Tracking it
                  </a>
                ) : (
                  <Button type="button" variant="secondary" size="md" aria-disabled={pending} onClick={() => run(() => trackGrantLead(g.id), `${g.title} added to Tracking.`)} className="h-11 rounded-xl px-4">
                    Track this
                  </Button>
                )}
                <Button type="button" variant="ghost" size="md" aria-disabled={pending} onClick={() => run(() => dismissGrantLead(g.id), `${g.title} removed from the list.`)} className="text-soft hover:text-foreground h-11 rounded-xl px-4">
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

function GrantCard({ g, now, businesses }: { g: Grant; now: string; businesses: string[] }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState(g.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function save(patch: Parameters<typeof updateGrant>[1], done: string) {
    if (pending) return;
    start(async () => {
      const r = await updateGrant(g.id, patch);
      if (!r.ok) return setError(r.error);
      setError("");
      setStatus(done);
      router.refresh();
    });
  }

  function remove() {
    if (!confirming) {
      setConfirming(true);
      setStatus(`Press Remove again to delete ${g.name}.`);
      return;
    }
    start(async () => {
      const r = await removeGrant(g.id);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <li className={CARD} aria-busy={pending}>
      <h3 className="text-[17px] leading-snug font-semibold break-words">
        {g.url ? (
          <a href={g.url} target="_blank" rel="noopener" className="underline-offset-2 hover:underline focus-visible:underline">
            {g.name}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          g.name
        )}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
        <dt className="text-soft">Pays</dt>
        <dd>{g.amount || "Not stated"}</dd>
        <dt className="text-soft">Deadline</dt>
        <dd>{g.deadline ? `${g.deadline} · ${dueText(g.deadline, new Date(now))}` : "No deadline set"}</dd>
        {g.applied_on && (
          <>
            <dt className="text-soft">Applied</dt>
            <dd>{g.applied_on}</dd>
          </>
        )}
      </dl>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-stage`} className="text-[14px] font-medium">
            Stage
          </label>
          <select id={`${id}-stage`} value={g.status} onChange={(e) => save({ status: e.target.value }, `Moved to ${GRANT_STATUS_LABEL[e.target.value as Grant["status"]]}.`)} className={cn(FIELD, "cursor-pointer")}>
            {GRANT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {GRANT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-biz`} className="text-[14px] font-medium">
            Business
          </label>
          <input
            id={`${id}-biz`}
            list={`${id}-bizlist`}
            defaultValue={g.business ?? ""}
            maxLength={120}
            onBlur={(e) => e.target.value !== (g.business ?? "") && save({ business: e.target.value }, "Business saved.")}
            className={FIELD}
          />
          <datalist id={`${id}-bizlist`}>
            {businesses.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-[14px] font-medium">
          Notes
        </label>
        <textarea id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className={AREA} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="md" aria-disabled={pending} onClick={() => save({ note }, "Notes saved.")} className="h-11 rounded-xl px-4">
          Save notes
        </Button>
        <Button type="button" variant="ghost" size="md" aria-disabled={pending} onClick={remove} className="text-soft hover:text-foreground h-11 rounded-xl px-4">
          {confirming ? "Remove: press again" : "Remove"}
        </Button>
      </div>
      <Status text={status} error={error} id={`${id}-err`} />
    </li>
  );
}

export function GrantTracker({ list, now }: { list: Grant[]; now: string }) {
  const id = useId();
  const businesses = [...new Set(["Bihub Technology", "WashCare", ...list.map((g) => g.business).filter((b): b is string => Boolean(b))])];
  const open = list.filter((g) => g.status !== "won" && g.status !== "lost").length;
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h2 id={`${id}-h`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
        Tracking <span className="text-soft font-normal tabular-nums">{list.length}</span>
      </h2>
      <p className="text-soft px-1">{open} still open. Move each one as it changes: Interested, Preparing, Applied, Shortlisted, Won or Not this time.</p>
      {list.length === 0 ? (
        <p className="text-soft rounded-2xl bg-white/[0.04] p-5 leading-normal">
          Nothing yet. Press Track this on a found grant, or add one on the{" "}
          <a href="/grants?view=add" className="text-foreground underline underline-offset-2">
            Add
          </a>{" "}
          tab.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((g) => (
            <GrantCard key={g.id} g={g} now={now} businesses={businesses} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AddGrant() {
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
      const r = await addGrant(form);
      if (!r.ok) {
        setError(r.error);
        setStatus("");
        document.getElementById(`${id}-name`)?.focus();
        return;
      }
      setError("");
      setStatus(`${form.get("name")} added to Tracking.`);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
      <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
        Add a grant you saw
      </h2>
      <p className="text-soft leading-normal">From WhatsApp, Instagram or a friend. Paste the link and the deadline so it sits in Tracking with the rest.</p>
      <form ref={formRef} onSubmit={add} aria-busy={pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-name`} className="text-[15px] font-medium">
            Name (required)
          </label>
          <input id={`${id}-name`} name="name" required maxLength={200} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-url`} className="text-[15px] font-medium">
            Link to the grant page
          </label>
          <input id={`${id}-url`} name="url" type="url" inputMode="url" placeholder="https://" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-provider`} className="text-[15px] font-medium">
            Who gives it
          </label>
          <input id={`${id}-provider`} name="provider" maxLength={200} autoComplete="organization" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-business`} className="text-[15px] font-medium">
            Which business
          </label>
          <input id={`${id}-business`} name="business" list={`${id}-bizlist`} maxLength={120} className={FIELD} />
          <datalist id={`${id}-bizlist`}>
            <option value="Bihub Technology" />
            <option value="WashCare" />
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-amount`} className="text-[15px] font-medium">
            What it pays
          </label>
          <input id={`${id}-amount`} name="amount" maxLength={120} placeholder="₦1,000,000" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-deadline`} className="text-[15px] font-medium">
            Deadline
          </label>
          <input id={`${id}-deadline`} name="deadline" type="date" className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-status`} className="text-[15px] font-medium">
            Stage
          </label>
          <select id={`${id}-status`} name="status" defaultValue="interested" className={cn(FIELD, "cursor-pointer")}>
            {GRANT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {GRANT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" size="md" aria-disabled={pending} className="h-12 rounded-xl px-6 text-[15px] sm:self-start">
            {pending ? "Saving…" : "Add grant"}
          </Button>
          <Status text={status} error={error} id={`${id}-err`} />
        </div>
      </form>
    </section>
  );
}

function AnswerCard({ a }: { a: GrantAnswer }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const words = a.answer.split(/\s+/).filter(Boolean).length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(a.answer);
      setStatus("Answer copied. Paste it into the form.");
    } catch {
      setStatus("Copy did not work. Select the text and copy it.");
    }
  }

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveAnswer({ id: a.id, question: String(f.get("question")), answer: String(f.get("answer")), business: String(f.get("business")) });
      if (!r.ok) return setError(r.error);
      setError("");
      setEditing(false);
      setStatus("Answer saved.");
      router.refresh();
    });
  }

  function remove() {
    if (!confirming) {
      setConfirming(true);
      setStatus("Press Delete again to remove this answer.");
      return;
    }
    start(async () => {
      const r = await removeAnswer(a.id);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <li className={CARD} aria-busy={pending}>
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          <AnswerFields id={id} a={a} error={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="md" aria-disabled={pending} className="h-11 rounded-xl px-4">
              Save answer
            </Button>
            <Button type="button" variant="ghost" size="md" onClick={() => setEditing(false)} className="text-soft hover:text-foreground h-11 rounded-xl px-4">
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <h3 className="text-[17px] leading-snug font-semibold break-words">{a.question}</h3>
          <p className="text-soft text-[13px]">
            {a.business ? `${a.business} · ` : ""}
            {words} words
          </p>
          <p className="leading-normal break-words whitespace-pre-line">{a.answer}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="md" onClick={copy} className="h-11 rounded-xl px-4">
              Copy answer
            </Button>
            <Button type="button" variant="ghost" size="md" onClick={() => setEditing(true)} className="text-soft hover:text-foreground h-11 rounded-xl px-4">
              Edit
            </Button>
            <Button type="button" variant="ghost" size="md" aria-disabled={pending} onClick={remove} className="text-soft hover:text-foreground h-11 rounded-xl px-4">
              {confirming ? "Delete: press again" : "Delete"}
            </Button>
          </div>
        </>
      )}
      <Status text={status} error={editing ? "" : error} id={`${id}-err2`} />
    </li>
  );
}

function AnswerFields({ id, a, error }: { id: string; a?: GrantAnswer; error: string }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-q`} className="text-[15px] font-medium">
          Question the form asks (required)
        </label>
        <input
          id={`${id}-q`}
          name="question"
          required
          maxLength={300}
          defaultValue={a?.question}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={FIELD}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-a`} className="text-[15px] font-medium">
          Your answer (required)
        </label>
        <textarea id={`${id}-a`} name="answer" required rows={5} maxLength={4000} defaultValue={a?.answer} className={AREA} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-b`} className="text-[15px] font-medium">
          Which business
        </label>
        <input id={`${id}-b`} name="business" list={`${id}-bl`} maxLength={120} defaultValue={a?.business ?? ""} className={FIELD} />
        <datalist id={`${id}-bl`}>
          <option value="Bihub Technology" />
          <option value="WashCare" />
        </datalist>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-danger">
          {error}
        </p>
      )}
    </>
  );
}

export function AnswerBank({ answers }: { answers: GrantAnswer[] }) {
  const id = useId();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? answers.filter((a) => `${a.question} ${a.answer} ${a.business ?? ""}`.toLowerCase().includes(q)) : answers;

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveAnswer({ question: String(f.get("question")), answer: String(f.get("answer")), business: String(f.get("business")) });
      if (!r.ok) {
        setError(r.error);
        setStatus("");
        document.getElementById(`${id}-q`)?.focus();
        return;
      }
      setError("");
      setStatus("Answer added to your bank.");
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
        <h2 id={`${id}-h`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
          Your answers <span className="text-soft font-normal tabular-nums">{answers.length}</span>
        </h2>
        <p className="text-soft px-1 leading-normal">Grant forms ask the same questions. Keep your best answer to each one here, then copy it into the next form.</p>
        <div className="flex max-w-[28em] flex-col gap-1.5 px-1">
          <label htmlFor={`${id}-search`} className="text-[15px] font-medium">
            Search your answers
          </label>
          <input id={`${id}-search`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} className={FIELD} />
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {q ? `${shown.length} answer${shown.length === 1 ? "" : "s"} match.` : ""}
        </p>
        {shown.length === 0 ? (
          <p className="text-soft rounded-2xl bg-white/[0.04] p-5 leading-normal">{answers.length ? "No answers match that search." : "No answers yet. Add your first one below."}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {shown.map((a) => (
              <AnswerCard key={a.id} a={a} />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby={`${id}-add`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
        <h2 id={`${id}-add`} className="text-[20px] font-semibold tracking-[-0.015em]">
          Add an answer
        </h2>
        <form ref={formRef} onSubmit={add} aria-busy={pending} className="flex flex-col gap-4">
          <AnswerFields id={id} error={error} />
          <div className="flex flex-col gap-2">
            <Button type="submit" variant="primary" size="md" aria-disabled={pending} className="h-12 rounded-xl px-6 text-[15px] sm:self-start">
              {pending ? "Saving…" : "Add answer"}
            </Button>
            <p role="status" aria-live="polite" className="text-soft empty:hidden">
              {status}
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
