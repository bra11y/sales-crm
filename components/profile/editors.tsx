"use client";

import { type ReactNode, useId, useState } from "react";
import Button from "@/components/_ui/button";

export const FIELD =
  "w-full rounded-lg border border-transparent border-b-[#6b6b6b] bg-transparent px-2 py-2 text-[14px] leading-normal text-foreground outline-none transition-[border-color,background-color] duration-150 ease-power3-out hover:bg-white/4 focus-visible:border-line-strong focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

export function Section({ id, title, hint, open = true, children }: { id: string; title: string; hint?: string; open?: boolean; children: ReactNode }) {
  const [expanded, setExpanded] = useState(open);
  return (
    <section aria-labelledby={`${id}-title`} className="border-line-strong border-t pt-2">
      <h2 id={`${id}-title`} className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`${id}-body`}
          onClick={() => setExpanded((e) => !e)}
          className="focus-visible:ring-ring group -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 text-left outline-none hover:bg-white/4 focus-visible:ring-2"
        >
          <span aria-hidden className="text-soft inline-block w-3 transition-transform duration-200 ease-power3-out group-aria-expanded:rotate-90 motion-reduce:transition-none">
            ›
          </span>
          {title}
        </button>
      </h2>
      <div id={`${id}-body`} hidden={!expanded} className="flex flex-col gap-3 pt-2 pb-6 pl-5">
        {hint && <p className="text-soft leading-normal">{hint}</p>}
        {children}
      </div>
    </section>
  );
}

export function Property({ label, value, onChange, type = "text", autoComplete, hint }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="grid grid-cols-1 items-start gap-1 sm:grid-cols-[11em_1fr] sm:gap-3">
      <label htmlFor={id} className="text-soft pt-2.5 text-[14px] sm:pt-2.5">
        {label}
      </label>
      <div>
        <input id={id} type={type} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} className={`${FIELD} min-h-11`} />
        {hint && (
          <p id={`${id}-hint`} className="caption-style text-soft px-2 pt-1">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

export function TextBlock({ label, value, onChange, rows = 3, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-soft px-2 text-[14px]">
        {label}
      </label>
      <textarea id={id} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} className={`${FIELD} resize-y`} />
      {hint && (
        <p id={`${id}-hint`} className="caption-style text-soft px-2">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Chips({ label, items, onChange, placeholderHint }: { label: string; items: string[]; onChange: (next: string[]) => void; placeholderHint: string }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");

  function add() {
    const words = draft.split(",").map((w) => w.trim()).filter(Boolean);
    const fresh = words.filter((w) => !items.some((i) => i.toLowerCase() === w.toLowerCase()));
    if (!fresh.length) {
      setNote(words.length ? `${words.join(", ")} is already in the list.` : "");
      return;
    }
    onChange([...items, ...fresh]);
    setDraft("");
    setNote(`Added ${fresh.join(", ")}.`);
  }

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={label} className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className="bg-(--tag-neutral-bg) border-(--tag-neutral-border) flex items-center gap-0.5 rounded-full border py-0.5 pr-0.5 pl-2.5 text-[14px]">
            {item}
            <button
              type="button"
              onClick={() => {
                onChange(items.filter((i) => i !== item));
                setNote(`Removed ${item}.`);
              }}
              aria-label={`Remove ${item}`}
              className="text-soft hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-full outline-none hover:bg-white/8 focus-visible:ring-2"
            >
              <span aria-hidden>×</span>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-soft">Nothing added yet.</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Add to {label}
        </label>
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          aria-describedby={`${id}-hint`}
          className="border-line-strong bg-secondary focus-visible:ring-ring h-11 min-w-0 flex-1 rounded-lg border px-3 text-[14px] outline-none focus-visible:ring-2 sm:max-w-[22em]"
        />
        <Button variant="secondary" size="md" className="h-11 px-4" onClick={add}>
          Add
        </Button>
      </div>
      <p id={`${id}-hint`} className="caption-style text-soft">
        {placeholderHint}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {note}
      </p>
    </div>
  );
}

export function Lines({ label, items, onChange, hint, rows = 4 }: { label: string; items: string[]; onChange: (next: string[]) => void; hint?: string; rows?: number }) {
  const [text, setText] = useState(items.join("\n"));
  return (
    <TextBlock
      label={label}
      value={text}
      rows={rows}
      hint={hint ?? "One per line."}
      onChange={(v) => {
        setText(v);
        onChange(v.split("\n").map((l) => l.trim()).filter(Boolean));
      }}
    />
  );
}
