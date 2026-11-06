"use client";

import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { deleteBill, findSavings, markPaid, saveBill, savePlan, setBillStatus, undoPayment } from "@/app/(crm)/bills/actions";
import { FIELD } from "@/components/learn/add-note";
import {
  type Bill,
  budget,
  CATEGORIES,
  CATEGORY_LABEL,
  type Category,
  CURRENCIES,
  CYCLE_LABEL,
  CYCLES,
  dueLabel,
  money,
  monthTotals,
  type Payment,
  perMonth,
  perYear,
  upcoming,
} from "@/lib/money/bills";
import { cn } from "@/lib/utils";

type Plan = { income: number | null; currency: string; save: number; tips: { list: { title: string; detail: string }[]; at: string } | null } | null;

const LABEL = "text-[15px] font-medium";
const HINT = "text-soft text-[13px] leading-normal";
const per = { week: "a week", month: "a month", quarter: "every 3 months", year: "a year", once: "once" } as const;
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function Bills({ bills, payments, plan, now }: { bills: Bill[]; payments: Payment[]; plan: Plan; now: string }) {
  const router = useRouter();
  const today = new Date(now);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [adding, setAdding] = useState(bills.length === 0);
  const [busy, setBusy] = useState<string | null>(null);

  const totals = monthTotals(bills, payments, today);
  const soon = upcoming(bills, 14, today);
  const active = bills.filter((b) => b.status === "active");
  const stopped = bills.filter((b) => b.status !== "active");
  const plan$ = plan?.income ? budget(plan.income, plan.currency, totals, plan.save) : null;
  const names = new Map(bills.map((b) => [b.id, b.name]));

  async function act(key: string, work: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    if (busy) return;
    setBusy(key);
    setProblem("");
    const r = await work();
    setBusy(null);
    if (!r.ok) return setProblem(r.error ?? "That did not work. Try again.");
    setStatus(ok);
    router.refresh();
  }

  async function pay(b: Bill) {
    if (busy) return;
    setBusy(b.id);
    setProblem("");
    const r = await markPaid(b.id);
    setBusy(null);
    if (!r.ok) return setProblem(r.error);
    setUndo({ id: r.paymentId, name: b.name });
    setStatus(`${b.name} marked as paid${r.next ? `. Next due ${longDate(r.next)}` : ""}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2" aria-live="polite">
        {status && (
          <p role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3 text-[15px]">
            {status}
            {undo && (
              <button
                type="button"
                className="focus-visible:ring-ring min-h-11 rounded-lg px-2 font-medium underline underline-offset-2 outline-none focus-visible:ring-2"
                onClick={() =>
                  act("undo", () => undoPayment(undo.id), `The payment for ${undo.name} was taken back.`).then(() => setUndo(null))
                }
              >
                Undo
              </button>
            )}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-danger">
            {problem}
          </p>
        )}
      </div>

      <section aria-labelledby="month-h" className="flex flex-col gap-3">
        <h2 id="month-h" className="text-[20px] font-semibold tracking-[-0.015em]">
          {today.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
        </h2>
        {totals.length ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {totals.map((t) => (
              <li key={t.currency} className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-soft text-[14px]">Due this month</span>
                  <span className="text-[32px] leading-none font-bold tracking-[-0.025em] tabular-nums">{money(t.due, t.currency)}</span>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-[14px]">
                  <Stat label="Paid" value={money(t.paid, t.currency)} />
                  <Stat label="Left to pay" value={money(t.left, t.currency)} />
                  <Stat label="A year" value={money(t.yearly, t.currency)} />
                </dl>
                {t.due > 0 && (
                  <div className="flex flex-col gap-1">
                    <div aria-hidden className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="bg-foreground h-full rounded-full" style={{ width: `${Math.min(100, (t.paid / t.due) * 100)}%` }} />
                    </div>
                    <p className="text-soft text-[13px]">{Math.round((t.paid / t.due) * 100)}% paid</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-soft">Add a bill or subscription to see this month&apos;s total.</p>
        )}
      </section>

      {soon.length > 0 && (
        <Group id="soon" title="Due in the next 2 weeks" count={soon.length}>
          {soon.map(({ bill: b, days }) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{b.name}</span>
                <span className={cn("text-[14px]", days < 0 ? "text-danger font-medium" : days <= 2 ? "text-(--tag-amber-text)" : "text-soft")}>
                  {dueLabel(days)} · {longDate(b.next_due)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{money(b.amount, b.currency)}</span>
                <Button variant="primary" size="md" className="h-11 rounded-xl px-4" aria-disabled={busy !== null} onClick={() => pay(b)}>
                  Mark paid<span className="sr-only">: {b.name}</span>
                </Button>
              </div>
            </li>
          ))}
        </Group>
      )}

      <PlanForm plan={plan} result={plan$} onSaved={() => router.refresh()} />

      <section aria-labelledby="all-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="all-h" className="text-[20px] font-semibold tracking-[-0.015em]">
            Everything you pay <span className="text-soft tabular-nums">{active.length}</span>
          </h2>
          {!adding && !editing && (
            <Button variant="primary" size="md" className="h-11 rounded-xl px-4" onClick={() => setAdding(true)}>
              Add a bill or subscription
            </Button>
          )}
        </div>

        {(adding || editing) && (
          <BillForm
            key={editing?.id ?? "new"}
            bill={editing}
            onDone={(msg) => {
              setAdding(false);
              setEditing(null);
              if (msg) {
                setUndo(null);
                setStatus(msg);
              }
              router.refresh();
            }}
          />
        )}

        {CATEGORIES.map((c) => {
          const list = active.filter((b) => b.category === c);
          if (!list.length) return null;
          return (
            <Group key={c} id={`cat-${c}`} title={CATEGORY_LABEL[c as Category]} count={list.length} small>
              {list.map((b) => (
                <BillRow key={b.id} b={b} busy={busy !== null} onEdit={() => setEditing(b)} onAct={act} />
              ))}
            </Group>
          );
        })}

        {stopped.length > 0 && (
          <details className="rounded-2xl bg-white/[0.04] px-4 py-3">
            <summary className="focus-visible:ring-ring cursor-pointer rounded text-[15px] font-medium outline-none focus-visible:ring-2">Paused, cancelled and paid once ({stopped.length})</summary>
            <ul className="mt-2 divide-y divide-white/[0.08]">
              {stopped.map((b) => (
                <BillRow key={b.id} b={b} busy={busy !== null} onEdit={() => setEditing(b)} onAct={act} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <Tips plan={plan} canAsk={active.length > 0} />

      {payments.length > 0 && (
        <Group id="paid" title="Recent payments" small>
          {payments.slice(0, 12).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
              <span className="min-w-0">
                {names.get(p.bill_id) ?? "Removed item"} <span className="text-soft">· {longDate(p.paid_on)}</span>
              </span>
              <span className="tabular-nums">{money(p.amount, p.currency)}</span>
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-soft text-[13px]">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Group({ id, title, count, small, children }: { id: string; title: string; count?: number; small?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-2">
      {small ? (
        <h3 id={`${id}-h`} className="text-soft px-4 text-[14px] font-medium">
          {title} {count !== undefined && <span className="tabular-nums">({count})</span>}
        </h3>
      ) : (
        <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
          {title} {count !== undefined && <span className="text-soft tabular-nums">{count}</span>}
        </h2>
      )}
      <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.04]">{children}</ul>
    </section>
  );
}

function BillRow({ b, busy, onEdit, onAct }: { b: Bill; busy: boolean; onEdit: () => void; onAct: (key: string, work: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void }) {
  const [sure, setSure] = useState(false);
  const monthly = b.cycle !== "month" && b.cycle !== "once" ? ` · about ${money(Math.round(perMonth(b)), b.currency)} a month` : "";
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">
            {b.url ? (
              <a href={b.url} target="_blank" rel="noreferrer" className="focus-visible:ring-ring rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2">
                {b.name}
                <span className="sr-only"> (opens their site in a new tab)</span>
              </a>
            ) : (
              b.name
            )}
          </span>
          <span className="text-soft text-[14px]">
            {b.status === "active" ? `Next ${longDate(b.next_due)}` : b.status === "paused" ? "Paused" : b.cycle === "once" ? "Paid" : "Cancelled"}
            {b.method ? ` · ${b.method}` : ""}
            {monthly}
          </span>
        </span>
        <span className="text-right tabular-nums">
          <span className="font-semibold">{money(b.amount, b.currency)}</span> <span className="text-soft text-[14px]">{per[b.cycle]}</span>
          {b.cycle !== "once" && <span className="text-soft block text-[13px]">{money(perYear(b), b.currency)} a year</span>}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="md" className="h-11 px-3" onClick={onEdit}>
          Edit<span className="sr-only"> {b.name}</span>
        </Button>
        {b.status === "active" ? (
          <Button variant="ghost" size="md" className="h-11 px-3" aria-disabled={busy} onClick={() => onAct(b.id, () => setBillStatus(b.id, "paused"), `${b.name} is paused. It is left out of your totals.`)}>
            Pause<span className="sr-only"> {b.name}</span>
          </Button>
        ) : (
          <Button variant="ghost" size="md" className="h-11 px-3" aria-disabled={busy} onClick={() => onAct(b.id, () => setBillStatus(b.id, "active"), `${b.name} is back in your totals.`)}>
            Turn back on<span className="sr-only"> {b.name}</span>
          </Button>
        )}
        {b.status === "active" && (
          <Button variant="ghost" size="md" className="h-11 px-3" aria-disabled={busy} onClick={() => onAct(b.id, () => setBillStatus(b.id, "cancelled"), `${b.name} is marked as cancelled. Remember to cancel it with them too.`)}>
            I cancelled it<span className="sr-only">: {b.name}</span>
          </Button>
        )}
        {sure ? (
          <>
            <Button variant="ghost" size="md" className="text-danger h-11 px-3" onClick={() => onAct(b.id, () => deleteBill(b.id), `${b.name} was deleted.`)}>
              Yes, delete<span className="sr-only"> {b.name} and its payments</span>
            </Button>
            <Button variant="ghost" size="md" className="h-11 px-3" onClick={() => setSure(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => setSure(true)}>
            Delete<span className="sr-only"> {b.name}</span>
          </Button>
        )}
      </div>
    </li>
  );
}

function BillForm({ bill, onDone }: { bill: Bill | null; onDone: (message: string) => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: string; message: string } | null>(null);
  const f = (n: string) => `${id}-${n}`;
  const inv = (n: string) => (err?.field === n ? { "aria-invalid": true as const, "aria-describedby": `${f(n)}-err` } : {});
  const errorFor = (n: string) =>
    err?.field === n ? (
      <p id={`${f(n)}-err`} role="alert" className="text-danger text-[14px]">
        {err.message}
      </p>
    ) : null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const r = await saveBill(d, bill?.id);
    setBusy(false);
    if (!r.ok) {
      const field = r.field ?? "name";
      setErr({ field, message: r.error });
      requestAnimationFrame(() => document.getElementById(f(field))?.focus());
      return;
    }
    onDone(bill ? `${d.name} was updated.` : `${d.name} was added.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <section aria-labelledby={f("h")} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-4 sm:p-5">
      <h3 id={f("h")} className="text-[17px] font-semibold">
        {bill ? `Edit ${bill.name}` : "Add a bill or subscription"}
      </h3>
      <form onSubmit={submit} aria-busy={busy} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={f("name")} className={LABEL}>
            Name (required)
          </label>
          <input id={f("name")} name="name" defaultValue={bill?.name} maxLength={120} required autoComplete="off" className={FIELD} {...inv("name")} />
          {errorFor("name")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={f("amount")} className={LABEL}>
            Amount (required)
          </label>
          <input id={f("amount")} name="amount" inputMode="decimal" defaultValue={bill?.amount} required className={FIELD} {...inv("amount")} />
          {errorFor("amount")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={f("currency")} className={LABEL}>
            Currency
          </label>
          <select id={f("currency")} name="currency" defaultValue={bill?.currency ?? "NGN"} className={FIELD}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={f("cycle")} className={LABEL}>
            How often
          </label>
          <select id={f("cycle")} name="cycle" defaultValue={bill?.cycle ?? "month"} className={FIELD}>
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {CYCLE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={f("next_due")} className={LABEL}>
            Next due (required)
          </label>
          <input id={f("next_due")} name="next_due" type="date" defaultValue={bill?.next_due ?? today} required className={FIELD} {...inv("next_due")} />
          {errorFor("next_due")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={f("category")} className={LABEL}>
            Type
          </label>
          <select id={f("category")} name="category" defaultValue={bill?.category ?? "subscription"} className={FIELD}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={f("method")} className={LABEL}>
            How you pay (optional)
          </label>
          <input id={f("method")} name="method" defaultValue={bill?.method ?? ""} maxLength={80} aria-describedby={`${f("method")}-hint`} className={FIELD} />
          <p id={`${f("method")}-hint`} className={HINT}>
            Like: GTBank card, Opay, transfer, cash.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={f("url")} className={LABEL}>
            Link to manage it (optional)
          </label>
          <input id={f("url")} name="url" type="url" inputMode="url" defaultValue={bill?.url ?? ""} className={FIELD} {...inv("url")} />
          {errorFor("url")}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={f("note")} className={LABEL}>
            Note (optional)
          </label>
          <input id={f("note")} name="note" defaultValue={bill?.note ?? ""} maxLength={500} className={FIELD} />
        </div>
        <input type="hidden" name="status" value={bill?.status ?? "active"} />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" size="md" className="h-11 rounded-xl px-5" aria-disabled={busy}>
            {busy ? "Saving…" : bill ? "Save changes" : "Add it"}
          </Button>
          <Button variant="ghost" size="md" className="h-11 px-3" onClick={() => onDone("")}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}

function PlanForm({ plan, result, onSaved }: { plan: Plan; result: { bills: number; save: number; left: number } | null; onSaved: () => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const currency = plan?.currency ?? "NGN";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const r = await savePlan({ income: d.income ?? "", currency: d.currency ?? "NGN", save: d.save ?? "10" });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setNote("Your budget is saved.");
    onSaved();
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
          Your budget
        </h2>
        <p className="text-soft leading-normal">Add what you earn in a month to see what is left after bills, with your savings set aside first.</p>
      </div>
      {result && (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/[0.04] p-3">
            <dt className="text-soft text-[13px]">Bills this month</dt>
            <dd className="text-[20px] font-semibold tabular-nums">{money(result.bills, currency)}</dd>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-3">
            <dt className="text-soft text-[13px]">Savings ({plan?.save}%)</dt>
            <dd className="text-[20px] font-semibold tabular-nums">{money(result.save, currency)}</dd>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-3">
            <dt className="text-soft text-[13px]">Left to spend</dt>
            <dd className={cn("text-[20px] font-semibold tabular-nums", result.left < 0 && "text-danger")}>
              {money(result.left, currency)}
              {result.left < 0 && <span className="block text-[13px] font-normal">Over budget: bills and savings are more than your income.</span>}
            </dd>
          </div>
        </dl>
      )}
      <form onSubmit={submit} aria-busy={busy} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem_9rem_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-income`} className={LABEL}>
            Monthly income
          </label>
          <input id={`${id}-income`} name="income" inputMode="decimal" defaultValue={plan?.income ?? ""} aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-err` : undefined} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-cur`} className={LABEL}>
            Currency
          </label>
          <select id={`${id}-cur`} name="currency" defaultValue={currency} className={FIELD}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-save`} className={LABEL}>
            Save each month
          </label>
          <select id={`${id}-save`} name="save" defaultValue={String(plan?.save ?? 10)} className={FIELD}>
            {[0, 5, 10, 15, 20, 25, 30, 40, 50].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary" size="md" className="h-11 rounded-xl px-5" aria-disabled={busy}>
          {busy ? "Saving…" : "Save budget"}
        </Button>
      </form>
      {err && (
        <p id={`${id}-err`} role="alert" className="text-danger text-[14px]">
          {err}
        </p>
      )}
      <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
        {note}
      </p>
    </section>
  );
}

function Tips({ plan, canAsk }: { plan: Plan; canAsk: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tips = plan?.tips?.list ?? [];

  async function ask() {
    if (busy) return;
    setBusy(true);
    setErr("");
    const r = await findSavings();
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    router.refresh();
  }

  return (
    <section aria-labelledby="tips-h" className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="tips-h" className="text-[20px] font-semibold tracking-[-0.015em]">
            Ways to save
          </h2>
          <p className="text-soft text-[14px] leading-normal">Ideas from your own list: overlaps, yearly plans and the biggest costs to look at first.</p>
        </div>
        <Button variant="secondary" size="md" className="h-11 rounded-xl px-4" aria-disabled={busy || !canAsk} onClick={ask}>
          {busy ? "Looking…" : tips.length ? "Look again" : "Find ways to save"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? "Looking at your list…" : ""}
      </p>
      {err && (
        <p role="alert" className="text-danger text-[14px]">
          {err}
        </p>
      )}
      {tips.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tips.map((t) => (
            <li key={t.title} className="flex flex-col gap-0.5">
              <span className="font-medium">{t.title}</span>
              <span className="text-soft leading-normal">{t.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {tips.length > 0 && <p className="text-soft text-[13px]">Written by AI from your list. Check prices with each company before you change a plan.</p>}
      {!canAsk && <p className="text-soft text-[14px]">Add your bills first.</p>}
    </section>
  );
}
