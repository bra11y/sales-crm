"use client";

import { useId, useState } from "react";
import { formatMoney } from "@/lib/crm/money";

export type Bar = { key: string; label: string; value: number; kind?: "actual" | "projected"; note?: string };

// One measure over time. Actual bars are blue; projected bars are aqua with a texture,
// and the legend names both. Hover shows the exact value; the table below gives every number.
export default function BarChart({ title, bars, currency, height = 180 }: { title: string; bars: Bar[]; currency: string; height?: number }) {
  const id = useId();
  const format = (v: number) => formatMoney(v, currency);
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const projected = bars.some((b) => b.kind === "projected");
  const shown = active === null ? null : bars[active];

  return (
    <figure className="flex flex-col gap-3" aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{title}</span>
        {projected && (
          <span className="text-soft flex items-center gap-3 text-[13px]">
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-[#3987e5]" />Actual</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-[#199e70] bg-[repeating-linear-gradient(45deg,transparent_0_2px,rgba(0,0,0,0.35)_2px_4px)]" />Expected</span>
          </span>
        )}
      </figcaption>

      <div aria-hidden className="relative" onMouseLeave={() => setActive(null)}>
        <div className="text-soft pointer-events-none absolute -top-1 right-0 text-[13px] tabular-nums">
          {shown ? `${shown.label}: ${format(shown.value)}${shown.note ? ` · ${shown.note}` : ""}` : `Top ${format(max)}`}
        </div>
        <div className="flex items-end gap-[2px] border-b border-white/15 pt-6" style={{ height }}>
          {bars.map((b, i) => (
            <div key={b.key} className="flex h-full min-w-0 flex-1 flex-col justify-end" onMouseEnter={() => setActive(i)}>
              <div
                className={`w-full rounded-t-[4px] transition-opacity duration-100 ${b.kind === "projected" ? "bg-[#199e70] bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgba(0,0,0,0.3)_3px_6px)]" : "bg-[#3987e5]"} ${active !== null && active !== i ? "opacity-50" : ""}`}
                style={{ height: `${b.value ? Math.max(2, (b.value / max) * 100) : 0}%` }}
              />
            </div>
          ))}
        </div>
        <div className="text-soft mt-1.5 flex gap-[2px] text-[12px]">
          {bars.map((b, i) => (
            <span key={b.key} className="min-w-0 flex-1 truncate text-center">{bars.length > 8 && i % 2 ? "" : b.label}</span>
          ))}
        </div>
      </div>

      <details className="text-[14px]">
        <summary className="text-soft focus-visible:ring-ring inline-flex min-h-11 cursor-pointer items-center rounded outline-none focus-visible:ring-2">Show as a table</summary>
        <table className="mt-1 w-full">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-soft text-left text-[13px]">
              <th scope="col" className="py-1 font-normal">Month</th>
              <th scope="col" className="py-1 text-right font-normal">Amount</th>
              {projected && <th scope="col" className="py-1 text-right font-normal">Type</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {bars.map((b) => (
              <tr key={b.key}>
                <th scope="row" className="py-1.5 text-left font-normal">{b.label}{b.note ? <span className="text-soft"> · {b.note}</span> : null}</th>
                <td className="py-1.5 text-right tabular-nums">{format(b.value)}</td>
                {projected && <td className="text-soft py-1.5 text-right">{b.kind === "projected" ? "Expected" : "Actual"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
