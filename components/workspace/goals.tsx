"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import { createGoal, deleteGoal, updateGoalTarget } from "@/app/(crm)/workspace-actions";
import type { GoalView } from "@/lib/crm/goal-views";
import { METRICS, PERIODS, STATUS_TEXT, type GoalStatus, type Metric, type Period } from "@/lib/crm/goals";
import { formatMoney } from "@/lib/crm/money";
import { cn } from "@/lib/utils";

const FIELD = "border-line-strong bg-secondary focus-visible:ring-ring h-11 rounded-xl border px-3 text-[14px] outline-none focus-visible:ring-2";
const TONE: Record<GoalStatus, { bar: string; dot: string; text: string }> = {
  done: { bar: "bg-success", dot: "bg-success", text: "text-success" },
  on_track: { bar: "bg-[#3987e5]", dot: "bg-[#3987e5]", text: "text-foreground" },
  behind: { bar: "bg-warning", dot: "bg-warning", text: "text-warning" },
  early: { bar: "bg-[#3987e5]", dot: "bg-soft", text: "text-soft" },
};
const PERIOD_WORD: Record<Period, string> = { week: "this week", month: "this month", quarter: "this quarter" };

function fmt(v: GoalView, n: number) {
  return v.money ? formatMoney(Math.round(n), v.goal.currency ?? "NGN") : n % 1 ? n.toFixed(1) : String(n);
}

export default function GoalBoard({ views, currencies, products }: { views: GoalView[]; currencies: string[]; products: { slug: string; name: string }[] }) {
  const names = Object.fromEntries(products.map((p) => [p.slug, p.name]));
  const reached = views.filter((v) => v.progress.status === "done").length;
  const behind = views.filter((v) => v.progress.status === "behind").length;
  return (
    <div className="flex flex-col gap-8">
      {views.length > 0 && (
        <p className="text-soft" role="status">
          {views.length} {views.length === 1 ? "goal" : "goals"} · {reached} reached · {behind} behind pace
        </p>
      )}
      {views.length ? (
        <section aria-labelledby="your-goals" className="flex flex-col gap-3">
          <h2 id="your-goals" className="sr-only">Your goals</h2>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {views.map((v) => <GoalCard key={v.goal.id} view={v} productName={v.goal.product ? names[v.goal.product] : undefined} />)}
          </ul>
        </section>
      ) : (
        <div className="flex flex-col gap-1 rounded-2xl bg-white/[0.04] px-5 py-6">
          <h2 className="text-[17px] font-semibold">No goals yet</h2>
          <p className="text-soft max-w-[36em]">Start with one you control, like “20 job applications each week”. Add a revenue goal once your apps have paying customers.</p>
        </div>
      )}
      <NewGoal currencies={currencies} products={products} />
    </div>
  );
}

export function GoalCard({ view, productName, compact = false }: { view: GoalView; productName?: string; compact?: boolean }) {
  const { goal, progress: p } = view;
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(String(view.money ? goal.target / 100 : goal.target));
  const [problem, setProblem] = useState("");
  const [busy, start] = useTransition();
  const tone = TONE[p.status];
  const pct = Math.min(100, (p.actual / p.target) * 100);
  const pace = Math.min(100, (p.expected / p.target) * 100);
  const maxHist = Math.max(p.target, ...p.history.map((h) => h.actual));
  const title = `${METRICS[goal.metric].label}${productName ? ` · ${productName}` : ""}`;

  function save(e: FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await updateGoalTarget(goal.id, view.money, Number(target));
      if (!r.ok) return setProblem(r.error);
      setProblem("");
      setEditing(false);
      router.refresh();
    });
  }
  function remove() {
    start(async () => {
      const r = await deleteGoal(goal.id);
      if (!r.ok) return setProblem(r.error);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
          <p className="text-soft text-[13px]">{PERIODS[goal.period]} · {p.label}{goal.note ? ` · ${goal.note}` : ""}</p>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-[14px]", tone.text)}>
          <span aria-hidden className={cn("size-2 rounded-full", tone.dot)} />
          {STATUS_TEXT[p.status]}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{fmt(view, p.actual)}</span>
          <span className="text-soft tabular-nums">of {fmt(view, p.target)} · {p.pct}%</span>
        </p>
        <div
          role="progressbar"
          aria-label={`${title}, ${PERIOD_WORD[goal.period]}`}
          aria-valuemin={0}
          aria-valuemax={p.target}
          aria-valuenow={Math.min(p.actual, p.target)}
          aria-valuetext={`${fmt(view, p.actual)} of ${fmt(view, p.target)}. ${STATUS_TEXT[p.status]}.`}
          className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.1]"
        >
          <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${pct}%` }} />
          {p.status !== "done" && <div aria-hidden className="bg-foreground absolute top-0 h-full w-[2px]" style={{ left: `${pace}%` }} title="Where you should be by today" />}
        </div>
        <p className="text-soft text-[13px]">
          {p.status === "done"
            ? `Reached with ${p.daysLeft} ${p.daysLeft === 1 ? "day" : "days"} to spare.`
            : `Pace line: ${fmt(view, p.expected)} by today. ${p.daysLeft} ${p.daysLeft === 1 ? "day" : "days"} left, so about ${fmt(view, view.money ? p.needPerDay : Math.ceil(p.needPerDay * 10) / 10)} a day. At this rate you end on ${fmt(view, p.projected)}.`}
        </p>
      </div>

      {!compact && (
        <div className="flex flex-col gap-1.5">
          <p className="text-soft text-[13px]">
            Last {p.history.length} {goal.period === "week" ? "weeks" : goal.period === "month" ? "months" : "quarters"}
            {p.streak > 0 ? ` · ${p.streak} in a row reached before this one` : ""}
          </p>
          <ol aria-label="Earlier results" className="flex items-end gap-[2px]" style={{ height: 56 }}>
            {p.history.map((h) => (
              <li key={h.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${h.label}: ${fmt(view, h.actual)}`}>
                <span className="sr-only">{h.label}: {fmt(view, h.actual)}, {h.current ? "so far" : h.hit ? "reached" : "missed"}.</span>
                <span aria-hidden className={cn("w-full rounded-t-[4px]", h.current ? "bg-[#3987e5]/60" : h.hit ? "bg-success" : "bg-white/25")} style={{ height: `${h.actual ? Math.max(4, (h.actual / maxHist) * 100) : 2}%` }} />
              </li>
            ))}
          </ol>
          <p aria-hidden className="text-soft flex gap-[2px] text-[11px]">
            {p.history.map((h) => <span key={h.label} className="min-w-0 flex-1 truncate text-center">{h.label.replace("Week of ", "")}</span>)}
          </p>
        </div>
      )}

      {!compact && (
        editing ? (
          <form onSubmit={save} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-t`} className="text-soft text-[14px]">New target{view.money ? ` (${goal.currency})` : ""}</label>
              <input id={`${id}-t`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={cn(FIELD, "w-36 tabular-nums")} aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-e` : undefined} />
            </div>
            <Button type="submit" variant="primary" size="md" className="h-11 px-4" aria-disabled={busy}>Save target</Button>
            <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => setEditing(false)}>Cancel</Button>
          </form>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" size="md" className="h-11 px-4" onClick={() => setEditing(true)}>Change target<span className="sr-only"> for {title}</span></Button>
            <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={remove} aria-disabled={busy}>Remove<span className="sr-only"> {title}</span></Button>
          </div>
        )
      )}
      {problem && <p id={`${id}-e`} role="alert" className="text-danger text-[14px]">{problem}</p>}
    </li>
  );
}

function NewGoal({ currencies, products }: { currencies: string[]; products: { slug: string; name: string }[] }) {
  const id = useId();
  const router = useRouter();
  const [metric, setMetric] = useState<Metric>("applications");
  const [period, setPeriod] = useState<Period>("week");
  const [target, setTarget] = useState("");
  const [currency, setCurrency] = useState(currencies[0]);
  const [product, setProduct] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const [busy, start] = useTransition();
  const money = METRICS[metric].unit === "money";
  const appMetric = metric === "revenue" || metric === "new_paid" || metric === "touches";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    start(async () => {
      const r = await createGoal({ metric, period, target: Number(target), currency: money ? currency : undefined, product: appMetric ? product : undefined, note });
      if (!r.ok) {
        setProblem(r.error);
        document.getElementById(`${id}-target`)?.focus();
        return;
      }
      setProblem("");
      setTarget("");
      setNote("");
      setDone("Goal added. It counts from the start of the period.");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h2 id={`${id}-h`} className="px-1 text-[17px] font-semibold tracking-[-0.01em]">Add a goal</h2>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-metric`} className="text-soft text-[14px]">Measure</label>
            <select id={`${id}-metric`} value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className={FIELD} aria-describedby={`${id}-hint`}>
              {(Object.keys(METRICS) as Metric[]).map((m) => <option key={m} value={m}>{METRICS[m].label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-period`} className="text-soft text-[14px]">How often</label>
            <select id={`${id}-period`} value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={FIELD}>
              {(Object.keys(PERIODS) as Period[]).map((p) => <option key={p} value={p}>{PERIODS[p]}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-target`} className="text-soft text-[14px]">Target{money ? ` (${currency})` : ""} (required)</label>
            <input id={`${id}-target`} required inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={money ? "500000" : "20"} className={cn(FIELD, "tabular-nums")} aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-err` : undefined} />
          </div>
          {money && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-cur`} className="text-soft text-[14px]">Currency</label>
              <select id={`${id}-cur`} value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD}>
                {currencies.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          {appMetric && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-app`} className="text-soft text-[14px]">App</label>
              <select id={`${id}-app`} value={product} onChange={(e) => setProduct(e.target.value)} className={FIELD}>
                <option value="">All apps</option>
                {products.filter((p) => p.slug !== "applications").map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1 sm:col-span-1">
            <label htmlFor={`${id}-note`} className="text-soft text-[14px]">Why it matters (optional)</label>
            <input id={`${id}-note`} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
          </div>
        </div>
        <p id={`${id}-hint`} className="text-soft text-[13px]">{METRICS[metric].hint}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="md" className="h-11 rounded-xl px-5 active:scale-[0.97] motion-reduce:active:scale-100" aria-disabled={busy}>Add goal</Button>
          <span role="status" aria-live="polite" className="text-soft text-[14px]">{busy ? "Saving…" : done}</span>
        </div>
        {problem && <p id={`${id}-err`} role="alert" className="text-danger text-[14px]">{problem}</p>}
      </form>
    </section>
  );
}
