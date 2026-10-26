"use client";

import { type FormEvent, useId, useState } from "react";
import type { Step } from "@/lib/grow/grow";
import { cn } from "@/lib/utils";

// Tick steps off, add your own. Each change saves; a failed save puts the list back.
export default function Checklist({ label, initial, save }: { label: string; initial: Step[]; save: (steps: Step[]) => Promise<{ ok: boolean; error?: string }> }) {
  const id = useId();
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  async function commit(next: Step[]) {
    const before = items;
    setItems(next);
    setError("");
    const r = await save(next);
    if (!r.ok) {
      setItems(before);
      setError(r.error ?? "That change was not saved.");
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    commit([...items, { text, done: false }]);
  }

  const done = items.filter((s) => s.done).length;
  return (
    <div className="flex flex-col gap-2">
      <p id={`${id}-sum`} className="text-soft text-[13px] tabular-nums">
        {done} of {items.length} steps done
      </p>
      <ul aria-label={label} aria-describedby={`${id}-sum`} className="flex flex-col">
        {items.map((s, i) => (
          <li key={`${i}-${s.text}`} className="flex items-start gap-1">
            <label className="flex min-h-11 flex-1 cursor-pointer items-start gap-3 py-2.5 text-[15px] leading-snug">
              <input type="checkbox" checked={s.done} onChange={() => commit(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} className="accent-primary mt-0.5 size-5 shrink-0" />
              <span className={cn("min-w-0 break-words", s.done && "text-soft line-through")}>{s.text}</span>
            </label>
            <button
              type="button"
              onClick={() => commit(items.filter((_, j) => j !== i))}
              className="text-soft hover:text-foreground focus-visible:ring-ring grid size-11 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-2"
            >
              <span aria-hidden>×</span>
              <span className="sr-only">Remove step: {s.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor={`${id}-new`} className="sr-only">
          Add a step to {label}
        </label>
        <input
          id={`${id}-new`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          placeholder="Add a step"
          className="border-line-strong bg-secondary focus-visible:ring-ring h-11 min-w-0 flex-1 rounded-xl border px-3 text-[15px] outline-none focus-visible:ring-2"
        />
        <button type="submit" className="bg-secondary border-line-strong focus-visible:ring-ring h-11 shrink-0 rounded-xl border px-4 text-[15px] outline-none focus-visible:ring-2">
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="text-danger text-[14px]">
          {error}
        </p>
      )}
    </div>
  );
}
