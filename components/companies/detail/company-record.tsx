"use client";

import { type FormEvent, useEffect, useId, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import FilterMenu from "@/components/_common/filter-menu";
import Sparkline from "@/components/_common/sparkline";
import DetailSection from "./detail-section";
import { addNote, type CompanyRecord, getCompanyRecord, moveCompany, updateCompanyValue } from "@/app/(crm)/workspace-actions";
import type { Company } from "@/data/companies";
import { formatMoney } from "@/lib/crm/money";
import { kindOf, KIND_LABEL } from "@/lib/crm/history";
import { useCompaniesStore } from "@/stores/companies-store";

const CONTROL =
  "h-10 w-full rounded-lg border border-line-strong bg-secondary px-3 text-[14px] text-foreground outline-none transition-[border-color] duration-150 ease-power3-out focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const SUB_STATUS: Record<string, string> = { trialing: "Trial", active: "Active", past_due: "Past due", cancelled: "Cancelled" };
const EVERY: Record<number, string> = { 1: "month", 3: "quarter", 6: "6 months", 12: "year" };

// The live parts of a company: its properties, money, timeline and people.
export default function CompanyRecordSections({ company }: { company: Company }) {
  const updateCompany = useCompaniesStore((s) => s.updateCompany);
  const products = useCompaniesStore((s) => s.products);
  const [record, setRecord] = useState<(CompanyRecord & { loadedAt: number }) | null>(null);
  const [loadError, setLoadError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    getCompanyRecord(company.id).then((r) => {
      if (!current) return;
      if (r.ok) setRecord({ ...r.record, loadedAt: Date.now() });
      else setLoadError(r.error);
    });
    return () => {
      current = false;
    };
  }, [company.id, version]);

  function changed(c: Company) {
    updateCompany(c);
    setVersion((v) => v + 1);
  }

  const productName = products.find((p) => p.slug === company.product)?.name ?? company.product ?? "";

  if (loadError) return <p role="alert" className="text-danger p-5">{loadError}</p>;
  if (!record) return <p className="text-soft p-5" role="status">Loading the record…</p>;

  return (
    <>
      <Properties company={company} record={record} productName={productName} onChange={changed} />
      <ActivitySummary company={company} record={record} />
      <Transactions record={record} />
      <Timeline company={company} record={record} onChange={changed} />
      <Contacts record={record} />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5em_1fr] items-center gap-3 py-1.5">
      <dt className="text-soft text-[14px]">{label}</dt>
      <dd className="min-w-0 text-[14px]">{children}</dd>
    </div>
  );
}

function Properties({ company, record, productName, onChange }: { company: Company; record: CompanyRecord; productName: string; onChange: (c: Company) => void }) {
  const id = useId();
  const stage = record.stages.find((s) => company.tags.includes(s)) ?? company.tags.at(-1) ?? "";
  const [value, setValue] = useState(String(company.pipelineValue));
  const [win, setWin] = useState(String(company.winProbability));
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, start] = useTransition();
  const currency = company.currency ?? "NGN";
  const dirty = value !== String(company.pipelineValue) || win !== String(company.winProbability);

  function move(next: string) {
    start(async () => {
      setProblem("");
      const r = await moveCompany(company.id, next);
      if (!r.ok) return setProblem(r.error);
      setNote(`Moved to ${next}.`);
      onChange(r.company);
    });
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (busy || !dirty) return;
    start(async () => {
      setProblem("");
      const r = await updateCompanyValue(company.id, Number(value), Number(win));
      if (!r.ok) return setProblem(r.error);
      setNote("Saved.");
      onChange(r.company);
    });
  }

  return (
    <DetailSection title="Properties">
      <dl className="flex flex-col">
        <Row label="Pipeline">{productName}</Row>
        <Row label="Stage">
          {record.editable && company.product === "direct" ? (
            <>
              <label htmlFor={`${id}-stage`} className="sr-only">Stage</label>
              <select id={`${id}-stage`} value={stage} onChange={(e) => move(e.target.value)} className={CONTROL} aria-describedby={`${id}-msg`}>
                {record.stages.map((s) => <option key={s}>{s}</option>)}
              </select>
            </>
          ) : (
            <span>
              {stage || "No stage"}
              <span className="text-soft block text-[13px]">
                {company.product === "applications" ? "Move it in the Application section below." : `Set by ${productName}'s own billing.`}
              </span>
            </span>
          )}
        </Row>
        <Row label="Last activity">{company.lastInteraction.date ? `${date(company.lastInteraction.date)} · ${company.lastInteraction.label}` : "None yet"}</Row>
        <Row label="Open deals">{company.openDeals}</Row>
        {!record.editable && (
          <>
            <Row label="Value"><span className="tabular-nums">{formatMoney(company.pipelineValue * 100, currency)} a year</span></Row>
            <Row label="Win chance"><span className="tabular-nums">{company.winProbability}%</span></Row>
          </>
        )}
      </dl>
      {record.editable && (
        <form onSubmit={save} className="flex flex-col gap-3" aria-describedby={`${id}-msg`}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-value`} className="text-soft text-[14px]">Value ({currency})</label>
              <input id={`${id}-value`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={`${CONTROL} tabular-nums`} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-win`} className="text-soft text-[14px]">Win chance (%)</label>
              <input id={`${id}-win`} inputMode="numeric" value={win} onChange={(e) => setWin(e.target.value)} className={`${CONTROL} tabular-nums`} />
            </div>
          </div>
          <p className="text-soft text-[13px]">
            Weighted value: <span className="text-foreground tabular-nums">{formatMoney(Math.round((Number(value) || 0) * (Number(win) || 0)), currency)}</span>
          </p>
          <Button type="submit" variant={dirty ? "primary" : "secondary"} size="md" className="h-10 self-start px-4" aria-disabled={busy || !dirty}>
            Save value
          </Button>
        </form>
      )}
      <p id={`${id}-msg`} role="status" aria-live="polite" className="text-soft text-[13px] empty:hidden">{busy ? "Saving…" : note}</p>
      {problem && <p role="alert" className="text-danger text-[14px]">{problem}</p>}
    </DetailSection>
  );
}

const WINDOWS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function ActivitySummary({ company, record }: { company: Company; record: CompanyRecord & { loadedAt: number } }) {
  const [days, setDays] = useState("30");
  const since = record.loadedAt - Number(days) * 86_400_000;
  // Payments are counted from the payments table, so their activity rows are skipped here.
  const recent = record.activities.filter((a) => Date.parse(a.at) >= since && kindOf(a.kind) !== "money");
  const paidRecent = record.payments.filter((p) => Date.parse(p.paid_at) >= since).length;
  const count = (k: string) => recent.filter((a) => kindOf(a.kind) === k).length;
  const stats = [
    { label: "Payments", value: paidRecent },
    { label: "Pipeline moves", value: count("pipeline") },
    { label: "Applications", value: count("application") },
    { label: "Notes", value: count("note") },
  ];
  const label = WINDOWS.find((w) => w.value === days)!.label.toLowerCase();
  return (
    <DetailSection title="Activity" action={<FilterMenu value={days} options={WINDOWS} onChange={setDays} align="end" />}>
      <div className="flex items-baseline gap-2">
        <span className="text-[24px] leading-none font-semibold tabular-nums">{recent.length + paidRecent}</span>
        <Sparkline values={company.trend} className="h-[22px]" />
        <span className="text-soft text-[13px]">
          things happened in the {label}
          <span className="sr-only">. The line shows activity per week over the last 14 weeks.</span>
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="border-line-strong flex flex-col gap-2 rounded-lg border p-[11px]">
            <dt className="text-soft text-[13px]">{s.label}</dt>
            <dd className="text-[17px] tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  );
}

function Transactions({ record }: { record: CompanyRecord }) {
  const [all, setAll] = useState(false);
  const paid = record.payments.filter((p) => p.status === "succeeded");
  const totals: Record<string, number> = {};
  for (const p of paid) totals[p.currency] = (totals[p.currency] ?? 0) + p.amount_minor;
  const failed = record.payments.length - paid.length;
  const shown = all ? record.payments : record.payments.slice(0, 8);
  const first = paid.at(-1);

  return (
    <DetailSection title="Transaction history">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-soft text-[13px]">Paid in total</dt>
          <dd className="text-[20px] font-semibold tracking-[-0.01em] tabular-nums">
            {Object.keys(totals).length ? Object.entries(totals).map(([c, v]) => formatMoney(v, c)).join(" · ") : "Nothing yet"}
          </dd>
        </div>
        <div>
          <dt className="text-soft text-[13px]">Payments</dt>
          <dd className="text-[20px] font-semibold tabular-nums">
            {paid.length}
            {failed > 0 && <span className="text-danger ml-2 text-[14px] font-normal">{failed} failed</span>}
          </dd>
        </div>
        <div>
          <dt className="text-soft text-[13px]">Customer since</dt>
          <dd className="text-[14px]">{first ? date(first.paid_at) : "Not paid yet"}</dd>
        </div>
        <div>
          <dt className="text-soft text-[13px]">Average payment</dt>
          <dd className="text-[14px] tabular-nums">{paid.length && Object.keys(totals).length === 1 ? formatMoney(Math.round(paid.reduce((s, p) => s + p.amount_minor, 0) / paid.length), paid[0].currency) : "—"}</dd>
        </div>
      </dl>

      {record.subscriptions.length > 0 && (
        <ul className="flex flex-col divide-y divide-white/[0.08] overflow-hidden rounded-xl bg-white/[0.04]">
          {record.subscriptions.map((s) => (
            <li key={s.product} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-[14px]">
              <span>
                <span className="font-medium">{s.plan}</span> · {SUB_STATUS[s.status] ?? s.status}
              </span>
              <span className="text-soft tabular-nums">
                {formatMoney(s.amount_minor, s.currency)} every {EVERY[s.interval_months] ?? `${s.interval_months} months`}
                {s.renews_at ? ` · ${s.status === "trialing" ? "trial ends" : "renews"} ${date(s.renews_at)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {record.payments.length ? (
        <>
          <table className="w-full text-[14px]">
            <caption className="sr-only">Payments, newest first</caption>
            <thead>
              <tr className="text-soft text-left text-[13px]">
                <th scope="col" className="py-1.5 font-normal">Date</th>
                <th scope="col" className="py-1.5 font-normal">Amount</th>
                <th scope="col" className="py-1.5 font-normal">Status</th>
                <th scope="col" className="py-1.5 text-right font-normal">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {shown.map((p) => (
                <tr key={`${p.provider}-${p.reference}`}>
                  <td className="py-2">{date(p.paid_at)}</td>
                  <td className="py-2 tabular-nums">{formatMoney(p.amount_minor, p.currency)}</td>
                  <td className="py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className={`size-1.5 rounded-full ${p.status === "succeeded" ? "bg-success" : "bg-danger"}`} />
                      {p.status === "succeeded" ? "Paid" : "Failed"}
                    </span>
                  </td>
                  <td className="text-soft max-w-[9em] truncate py-2 text-right text-[13px]" title={`${p.provider} ${p.reference}`}>{p.provider} {p.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {record.payments.length > 8 && (
            <Button variant="ghost" size="md" className="text-soft h-10 self-start px-2" onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? "Show fewer" : `Show all ${record.payments.length} payments`}
            </Button>
          )}
        </>
      ) : (
        <p className="text-soft text-[14px]">No payments for this company yet.</p>
      )}
    </DetailSection>
  );
}

function Timeline({ company, record, onChange }: { company: Company; record: CompanyRecord; onChange: (c: Company) => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const [busy, start] = useTransition();
  const [all, setAll] = useState(false);
  const shown = all ? record.activities : record.activities.slice(0, 12);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    start(async () => {
      setProblem("");
      const r = await addNote(company.id, text);
      if (!r.ok) {
        setProblem(r.error);
        document.getElementById(`${id}-note`)?.focus();
        return;
      }
      setText("");
      setDone("Note added to the timeline.");
      onChange(r.company);
    });
  }

  return (
    <DetailSection title="Timeline">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={`${id}-note`} className="text-soft text-[14px]">Add a note, call or meeting</label>
        <textarea
          id={`${id}-note`}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-err` : undefined}
          className="border-line-strong bg-secondary focus-visible:border-ring focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-[14px] outline-none focus-visible:ring-2"
        />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" size="md" className="h-10 px-4" aria-disabled={busy}>Add note</Button>
          <span role="status" aria-live="polite" className="text-soft text-[13px]">{busy ? "Saving…" : done}</span>
        </div>
        {problem && <p id={`${id}-err`} role="alert" className="text-danger text-[14px]">{problem}</p>}
      </form>
      {record.activities.length ? (
        <ol className="flex flex-col">
          {shown.map((a) => (
            <li key={a.id} className="relative border-l border-white/10 pb-3 pl-4 last:pb-0">
              <span aria-hidden className="bg-icon absolute top-1.5 -left-[3.5px] size-1.5 rounded-full" />
              <p className="text-[14px] leading-snug">{a.summary}</p>
              <p className="text-soft text-[13px]">
                {KIND_LABEL[kindOf(a.kind)]} · <time dateTime={a.at}>{dateTime(a.at)}</time>
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-soft text-[14px]">Nothing has happened here yet.</p>
      )}
      {record.activities.length > 12 && (
        <Button variant="ghost" size="md" className="text-soft h-10 self-start px-2" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${record.activities.length}`}
        </Button>
      )}
    </DetailSection>
  );
}

function Contacts({ record }: { record: CompanyRecord }) {
  return (
    <DetailSection title="People" className="shadow-none">
      {record.contacts.length ? (
        <ul className="flex flex-col gap-2">
          {record.contacts.map((c) => (
            <li key={c.name} className="flex flex-col text-[14px]">
              <span className="font-medium">{c.name}</span>
              <span className="text-soft flex flex-wrap gap-x-3">
                {c.email && <a href={`mailto:${c.email}`} className="hover:text-foreground underline underline-offset-2">{c.email}</a>}
                {c.phone && <a href={`tel:${c.phone}`} className="hover:text-foreground underline underline-offset-2">{c.phone}</a>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-soft text-[14px]">No contacts yet. They arrive with each app&apos;s sign-up events.</p>
      )}
    </DetailSection>
  );
}
