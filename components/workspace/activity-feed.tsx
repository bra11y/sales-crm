"use client";

import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";
import Button from "@/components/_ui/button";
import { byDay, historyCsv, type HistoryItem, type HistoryKind, KIND_LABEL } from "@/lib/crm/history";
import { formatMoney } from "@/lib/crm/money";
import { cn } from "@/lib/utils";

const KINDS = Object.keys(KIND_LABEL) as HistoryKind[];
const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];
const DOT: Record<HistoryKind, string> = { money: "bg-[#3987e5]", pipeline: "bg-[#9085e9]", application: "bg-[#199e70]", email: "bg-[#c98500]", note: "bg-[#d0d4dd]" };
const PAGE = 150;

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function ActivityFeed({ items, now, company, companyName, products }: { items: HistoryItem[]; now: string; company: string | null; companyName: string | null; products: { slug: string; name: string }[] }) {
  const id = useId();
  const [kinds, setKinds] = useState<HistoryKind[]>([]);
  const [range, setRange] = useState(company ? "all" : "30");
  const [product, setProduct] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(query.trim().toLowerCase());
  const names = Object.fromEntries(products.map((p) => [p.slug, p.name]));

  const filtered = useMemo(() => {
    const since = range === "all" ? 0 : Date.parse(now) - Number(range) * 86_400_000;
    return items.filter(
      (i) =>
        (!company || i.companyId === company) &&
        (!kinds.length || kinds.includes(i.kind)) &&
        (!product || i.product === product) &&
        Date.parse(i.at) >= since &&
        (!q || `${i.title} ${i.detail ?? ""} ${i.companyName ?? ""}`.toLowerCase().includes(q)),
    );
  }, [items, company, kinds, product, range, now, q]);

  const days = useMemo(() => byDay(filtered.slice(0, limit), new Date(now)), [filtered, limit, now]);
  const paidTotals: Record<string, number> = {};
  let failed = 0;
  for (const i of filtered) {
    if (i.kind !== "money") continue;
    if (i.failed) failed++;
    else if (i.currency && i.amountMinor) paidTotals[i.currency] = (paidTotals[i.currency] ?? 0) + i.amountMinor;
  }

  function toggle(k: HistoryKind) {
    setKinds((all) => (all.includes(k) ? all.filter((x) => x !== k) : [...all, k]));
    setLimit(PAGE);
  }

  function download() {
    const blob = new Blob([historyCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `activity-${now.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const counts = Object.fromEntries(KINDS.map((k) => [k, filtered.filter((i) => i.kind === k).length]));

  return (
    <div className="flex flex-col gap-6">
      {company && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.04] px-4 py-3 text-[14px]">
          Showing only <strong className="font-semibold">{companyName ?? "one company"}</strong>.
          <Link href="/activity" className="underline underline-offset-2">Show everything</Link>
        </p>
      )}

      <div className="flex flex-col gap-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Show these types</legend>
          {KINDS.map((k) => {
            const on = kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(k)}
                className={cn(
                  "focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] outline-none focus-visible:ring-2 active:scale-[0.97] motion-reduce:active:scale-100",
                  on ? "bg-foreground text-background" : "bg-white/[0.06] hover:bg-white/[0.1]",
                )}
              >
                <span aria-hidden className={cn("size-2 rounded-full", DOT[k])} />
                {KIND_LABEL[k]}
                <span className={cn("tabular-nums", on ? "opacity-70" : "text-soft")}>{counts[k]}</span>
              </button>
            );
          })}
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[14em] flex-1 flex-col gap-1">
            <label htmlFor={`${id}-q`} className="text-soft text-[14px]">Search</label>
            <input id={`${id}-q`} type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Company, amount, reference…" className="border-line-strong bg-secondary focus-visible:ring-ring h-11 rounded-xl border px-3 text-[14px] outline-none focus-visible:ring-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-range`} className="text-soft text-[14px]">Period</label>
            <select id={`${id}-range`} value={range} onChange={(e) => { setRange(e.target.value); setLimit(PAGE); }} className="border-line-strong bg-secondary focus-visible:ring-ring h-11 rounded-xl border px-3 text-[14px] outline-none focus-visible:ring-2">
              {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-product`} className="text-soft text-[14px]">App</label>
            <select id={`${id}-product`} value={product} onChange={(e) => { setProduct(e.target.value); setLimit(PAGE); }} className="border-line-strong bg-secondary focus-visible:ring-ring h-11 rounded-xl border px-3 text-[14px] outline-none focus-visible:ring-2">
              <option value="">All apps</option>
              {products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </div>
          <Button variant="secondary" size="md" className="h-11 px-4" onClick={download} aria-disabled={!filtered.length}>
            Download CSV
          </Button>
        </div>
      </div>

      <p role="status" aria-live="polite" className="text-soft text-[14px]">
        {filtered.length} {filtered.length === 1 ? "event" : "events"}
        {Object.keys(paidTotals).length ? ` · ${Object.entries(paidTotals).map(([c, v]) => formatMoney(v, c)).join(" · ")} paid in` : ""}
        {failed ? ` · ${failed} failed ${failed === 1 ? "payment" : "payments"}` : ""}
      </p>

      {days.length ? (
        <div className="flex flex-col gap-6">
          {days.map((d) => (
            <section key={d.day} aria-labelledby={`${id}-${d.day}`} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2 px-4">
                <h2 id={`${id}-${d.day}`} className="text-[17px] font-semibold tracking-[-0.01em]">{d.label}</h2>
                {Object.keys(d.paid).length > 0 && (
                  <span className="text-soft text-[13px] tabular-nums">{Object.entries(d.paid).map(([c, v]) => formatMoney(v, c)).join(" · ")} in</span>
                )}
              </div>
              <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.04]">
                {d.items.map((i) => (
                  <li key={i.id} className="flex gap-3 px-4 py-3">
                    <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", i.failed ? "bg-danger" : DOT[i.kind])} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className={cn("leading-snug", i.failed && "text-danger")}>
                        <span className="sr-only">{KIND_LABEL[i.kind]}: </span>
                        {i.title}
                      </p>
                      <p className="text-soft flex flex-wrap gap-x-2 text-[13px]">
                        <time dateTime={i.at}>{time(i.at)}</time>
                        {i.companyName && (i.companyId ? <Link href={`/?company=${i.companyId}`} className="hover:text-foreground underline underline-offset-2">{i.companyName}</Link> : <span>{i.companyName}</span>)}
                        {i.product && <span>{names[i.product] ?? i.product}</span>}
                        {i.detail && <span className="min-w-0 truncate">{i.detail}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {filtered.length > limit && (
            <Button variant="secondary" size="md" className="h-11 self-center px-5" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, filtered.length - limit)} more
            </Button>
          )}
        </div>
      ) : (
        <p className="text-soft rounded-2xl bg-white/[0.04] px-4 py-3.5">Nothing matches. Try a longer period or clear the filters.</p>
      )}
    </div>
  );
}
