"use client";

import { type FormEvent, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { addCareerGoal, removeCareerGoal, updateCareerGoal } from "@/app/(crm)/grow-actions";
import { type CareerGoal, dueText, progress } from "@/lib/grow/grow";
import Checklist from "./checklist";

const FIELD = "w-full rounded-xl border border-line-strong bg-secondary px-3 h-11 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

export default function CareerGoals({ goals, now }: { goals: CareerGoal[]; now: string }) {
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
      const r = await addCareerGoal(form);
      if (!r.ok) {
        setError(r.error);
        setStatus("");
        document.getElementById(`${id}-title`)?.focus();
        return;
      }
      setError("");
      setStatus(`Goal added with first steps. Edit them to fit.`);
      formRef.current?.reset();
      router.refresh();
    });
  }

  const open = goals.filter((g) => !g.done_at);
  const done = goals.filter((g) => g.done_at);
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={`${id}-add`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
        <h2 id={`${id}-add`} className="text-[20px] font-semibold tracking-[-0.015em]">
          Set a goal
        </h2>
        <form ref={formRef} onSubmit={add} aria-busy={pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={`${id}-title`} className="text-[15px] font-medium">
              Your goal (required)
            </label>
            <input
              id={`${id}-title`}
              name="title"
              required
              maxLength={200}
              placeholder="Land a remote job paying $2,000 a month"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-err` : undefined}
              className={FIELD}
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[15px] font-medium">How far away</legend>
            <div className="flex gap-2">
              <label className="border-line-strong has-checked:border-ring flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[15px] has-checked:bg-white/[0.08]">
                <input type="radio" name="horizon" value="short" defaultChecked className="accent-primary size-4" /> Short term (under a year)
              </label>
              <label className="border-line-strong has-checked:border-ring flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[15px] has-checked:bg-white/[0.08]">
                <input type="radio" name="horizon" value="long" className="accent-primary size-4" /> Long term
              </label>
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-due`} className="text-[15px] font-medium">
              By when
            </label>
            <input id={`${id}-due`} name="due" type="date" className={FIELD} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={`${id}-why`} className="text-[15px] font-medium">
              Why it matters to you
            </label>
            <input id={`${id}-why`} name="why" maxLength={500} className={FIELD} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" size="md" aria-disabled={pending} className="h-12 rounded-xl px-6 text-[15px] sm:self-start">
              {pending ? "Saving…" : "Add goal"}
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

      {(["short", "long"] as const).map((h) => {
        const list = open.filter((g) => g.horizon === h);
        return (
          <section key={h} aria-labelledby={`${id}-${h}`} className="flex flex-col gap-3">
            <h2 id={`${id}-${h}`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
              {h === "short" ? "Short-term goals" : "Long-term goals"} <span className="text-soft font-normal tabular-nums">{list.length}</span>
            </h2>
            {list.length ? (
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {list.map((g) => (
                  <Goal key={g.id} g={g} now={now} />
                ))}
              </ul>
            ) : (
              <p className="text-soft rounded-2xl bg-white/[0.04] p-5">
                {h === "short" ? "Nothing yet. A short-term goal is one you can finish this year." : "Nothing yet. Where do you want to be in 3 to 5 years?"}
              </p>
            )}
          </section>
        );
      })}

      {done.length > 0 && (
        <section aria-labelledby={`${id}-done`} className="flex flex-col gap-3">
          <h2 id={`${id}-done`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
            Done <span className="text-soft font-normal tabular-nums">{done.length}</span>
          </h2>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {done.map((g) => (
              <Goal key={g.id} g={g} now={now} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Goal({ g, now }: { g: CareerGoal; now: string }) {
  const id = useId();
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [sure, setSure] = useState(false);
  const [pct, setPct] = useState(progress(g.steps));
  const [, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? ok : (r.error ?? "Not saved."));
      if (r.ok) router.refresh();
    });

  return (
    <li aria-labelledby={`${id}-t`} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-t`} className="text-[17px] leading-snug font-semibold break-words">
          {g.title}
        </h3>
        <p className="text-soft text-[14px]">
          {g.done_at ? "Done" : g.due_on ? dueText(g.due_on, new Date(now)).replace("Closes", "Due").replace("Closed", "Was due").replace("days left", "days to go") : "No date set"}
        </p>
        {g.why && <p className="text-[14px] leading-normal break-words">{g.why}</p>}
      </div>
      <div
        role="meter"
        aria-label={`Progress on ${g.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% of steps done`}
        className="h-2 overflow-hidden rounded-full bg-white/[0.1]"
      >
        <div className="bg-success h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <Checklist
        label={`Steps for ${g.title}`}
        initial={g.steps}
        save={async (steps) => {
          const r = await updateCareerGoal(g.id, { steps });
          if (r.ok) setPct(progress(steps));
          return r;
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="h-11 rounded-xl px-4"
          onClick={() => run(() => updateCareerGoal(g.id, { done: !g.done_at }), g.done_at ? "Moved back to your goals." : "Marked done. Well done.")}
        >
          {g.done_at ? "Not done yet" : "Mark goal done"}
        </Button>
        {sure ? (
          <>
            <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-3" onClick={() => run(() => removeCareerGoal(g.id), "Removed.")}>
              Yes, remove it
            </Button>
            <Button type="button" variant="ghost" size="md" className="h-11 px-3" onClick={() => setSure(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => setSure(true)}>
            Remove<span className="sr-only"> {g.title}</span>
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
        {msg}
      </p>
    </li>
  );
}
