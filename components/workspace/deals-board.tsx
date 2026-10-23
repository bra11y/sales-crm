"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveCompany } from "@/app/(crm)/workspace-actions";
import { formatMoney } from "@/lib/crm/money";
import { cn } from "@/lib/utils";

export type Card = {
  id: string;
  name: string;
  product: string;
  stage: string;
  segment: string | null;
  valueMinor: number;
  currency: string;
  win: number;
  days: number;
  lastLabel: string | null;
  slipping: boolean;
};

const ago = (days: number) => (days >= 9999 ? "No activity yet" : days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`);

export default function DealsBoard({ cards: initial, stages, editable, allStages }: { cards: Card[]; stages: string[]; editable: boolean; allStages: string[] }) {
  const [cards, setCards] = useState(initial);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();

  function move(card: Card, stage: string) {
    if (card.stage === stage) return;
    const before = cards;
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, stage } : c)));
    setProblem("");
    setStatus(`Moving ${card.name} to ${stage}…`);
    start(async () => {
      const r = await moveCompany(card.id, stage);
      if (!r.ok) {
        setCards(before);
        setStatus("");
        setProblem(r.error);
        return;
      }
      setCards((all) => all.map((c) => (c.id === card.id ? { ...c, stage, win: r.company.winProbability, days: 0, slipping: false } : c)));
      setStatus(`${card.name} moved to ${stage}.`);
    });
  }

  if (!cards.length) {
    return <p className="text-soft rounded-2xl bg-white/[0.04] px-4 py-3.5">Nothing here. When companies arrive in this pipeline, they show up as cards.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">{status}</p>
      {problem && <p role="alert" className="text-danger text-[14px]">{problem}</p>}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        {stages.map((stage) => {
          const col = cards.filter((c) => c.stage === stage).sort((a, b) => b.valueMinor - a.valueMinor);
          const currencies = [...new Set(col.map((c) => c.currency))];
          const total = currencies.map((cur) => formatMoney(col.filter((c) => c.currency === cur).reduce((s, c) => s + c.valueMinor, 0), cur)).join(" · ");
          const headId = `col-${stage.replace(/\W+/g, "-")}`;
          return (
            <section
              key={stage}
              aria-labelledby={headId}
              onDragOver={editable ? (e) => { e.preventDefault(); setOver(stage); } : undefined}
              onDragLeave={editable ? () => setOver((o) => (o === stage ? null : o)) : undefined}
              onDrop={editable ? (e) => {
                e.preventDefault();
                setOver(null);
                const card = cards.find((c) => c.id === e.dataTransfer.getData("text/plain"));
                if (card) move(card, stage);
              } : undefined}
              className={cn("flex w-[17.5rem] shrink-0 snap-start flex-col gap-2 rounded-2xl bg-white/[0.03] p-2 transition-colors duration-150", over === stage && "bg-white/[0.08]")}
            >
              <header className="flex flex-col gap-0.5 px-2 pt-1.5 pb-1">
                <h2 id={headId} className="text-[15px] font-semibold">
                  {stage} <span className="text-soft font-normal tabular-nums">{col.length}</span>
                </h2>
                <p className="text-soft text-[13px] tabular-nums">{total || "No value yet"}</p>
              </header>
              <ul className="flex flex-col gap-2">
                {col.map((c) => (
                  <li
                    key={c.id}
                    draggable={editable}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); setDragging(c.id); }}
                    onDragEnd={() => setDragging(null)}
                    className={cn("flex flex-col gap-2 rounded-xl bg-[#1e1e1e] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]", editable && "cursor-grab active:cursor-grabbing", dragging === c.id && "opacity-50")}
                  >
                    <Link href={`/?company=${c.id}`} className="focus-visible:ring-ring rounded font-medium leading-snug outline-none hover:underline focus-visible:ring-2">
                      {c.name}
                    </Link>
                    <p className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                      <span className="tabular-nums">{formatMoney(c.valueMinor, c.currency)}</span>
                      <span className="text-soft tabular-nums">{c.win}% chance</span>
                    </p>
                    <p className={cn("flex items-center gap-1.5 text-[13px]", c.slipping ? "text-(--tag-amber-text)" : "text-soft")}>
                      {c.slipping && <span aria-hidden className="size-1.5 rounded-full bg-[#fbbf24]" />}
                      {c.slipping ? `Slipping · ${ago(c.days)}` : ago(c.days)}
                      {c.lastLabel && !c.slipping ? ` · ${c.lastLabel}` : ""}
                    </p>
                    {editable && (
                      <>
                        <label htmlFor={`move-${c.id}`} className="sr-only">Move {c.name} to</label>
                        <select
                          id={`move-${c.id}`}
                          value={c.stage}
                          onChange={(e) => move(c, e.target.value)}
                          className="border-line-strong bg-secondary focus-visible:ring-ring h-9 rounded-lg border px-2 text-[13px] outline-none focus-visible:ring-2"
                        >
                          {allStages.map((s) => <option key={s} value={s}>{s === c.stage ? `Stage: ${s}` : `Move to ${s}`}</option>)}
                        </select>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {!col.length && <p className="text-soft px-2 pb-2 text-[13px]">{editable ? "Drop a card here." : "None."}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
