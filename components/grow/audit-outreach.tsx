"use client";

import { type FormEvent, useId, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import { checkSite, draftOutreach, removeProspect, setProspectStatus } from "@/app/(crm)/freelance/actions";
import type { Finding } from "@/lib/audit/check";
import { cn } from "@/lib/utils";

export type Prospect = {
  id: string;
  company: string;
  url: string;
  contact_name: string | null;
  contact_email: string | null;
  score: number | null;
  findings: Finding[];
  status: string;
  checked_at: string | null;
};
export type Suggestion = { company: string; website: string };

const FIELD = "w-full rounded-xl border border-line-strong bg-secondary px-3 h-11 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";
const STAGES: [string, string][] = [
  ["checked", "Checked"],
  ["drafted", "Email drafted"],
  ["sent", "Email sent"],
  ["replied", "Replied"],
  ["won", "Won the work"],
  ["not_now", "Not now"],
];

export default function AuditOutreach({ prospects, suggestions }: { prospects: Prospect[]; suggestions: Suggestion[] }) {
  const id = useId();
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function check(input: { company: string; url: string; contactName?: string; contactEmail?: string }) {
    if (pending) return;
    start(async () => {
      setError("");
      setStatus(`Checking ${input.url}…`);
      const r = await checkSite(input);
      if (!r.ok) {
        setStatus("");
        setError(r.error);
        return;
      }
      setStatus(r.note ?? "Checked.");
      setCompany("");
      setUrl("");
      setContactName("");
      setContactEmail("");
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    check({ company, url, contactName, contactEmail });
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
        <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
          Check a company&rsquo;s website
        </h2>
        <p className="text-soft leading-normal">
          A quick check of the home page finds problems a machine can prove: missing alt text, unlabelled fields, blocked zoom. It writes a short email naming them into your Gmail Drafts. Nothing is
          sent: you read it and send it yourself.
        </p>
        <form onSubmit={submit} aria-busy={pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-co`} className="text-[15px] font-medium">
              Company (required)
            </label>
            <input id={`${id}-co`} value={company} onChange={(e) => setCompany(e.target.value)} required maxLength={200} autoComplete="organization" className={FIELD} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-url`} className="text-[15px] font-medium">
              Website (required)
            </label>
            <input
              id={`${id}-url`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              inputMode="url"
              placeholder="acme.com"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-err` : undefined}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-cn`} className="text-[15px] font-medium">
              Contact name
            </label>
            <input id={`${id}-cn`} value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={120} autoComplete="off" className={FIELD} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-ce`} className="text-[15px] font-medium">
              Contact email
            </label>
            <input id={`${id}-ce`} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} autoComplete="off" className={FIELD} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" size="md" aria-disabled={pending} className="h-12 rounded-xl px-6 text-[15px] sm:self-start">
              {pending ? "Checking…" : "Check the site"}
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

      {suggestions.length > 0 && (
        <section aria-labelledby={`${id}-sug`} className="flex flex-col gap-2">
          <h2 id={`${id}-sug`} className="px-1 text-[17px] font-semibold">
            Companies from your Jobs
          </h2>
          <p className="text-soft px-1 text-[14px]">Companies hiring in your field often need an audit too.</p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.website}>
                <button
                  type="button"
                  onClick={() => check({ company: s.company, url: s.website })}
                  aria-disabled={pending}
                  className="border-line-strong focus-visible:ring-ring inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[14px] outline-none hover:bg-white/[0.06] focus-visible:ring-2"
                >
                  Check {s.company}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${id}-list`} className="flex flex-col gap-3">
        <h2 id={`${id}-list`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
          Companies you checked <span className="text-soft font-normal tabular-nums">{prospects.length}</span>
        </h2>
        {prospects.length === 0 ? (
          <p className="text-soft rounded-2xl bg-white/[0.04] p-5">None yet. Check a site above.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {prospects.map((p) => (
              <Card key={p.id} p={p} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ p }: { p: Prospect }) {
  const id = useId();
  const [stage, setStage] = useState(p.status);
  const [msg, setMsg] = useState("");
  const [text, setText] = useState("");
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();

  function draft() {
    if (pending) return;
    start(async () => {
      setMsg("Writing the email…");
      const r = await draftOutreach(p.id);
      if (!r.ok) return setMsg(r.error);
      setMsg(r.note ?? "Drafted.");
      setText(r.text ?? "");
      setStage("drafted");
    });
  }

  return (
    <li aria-labelledby={`${id}-n`} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={`${id}-n`} className="text-[17px] font-semibold break-words">
            {p.company}
          </h3>
          <a href={p.url} target="_blank" rel="noopener" className="text-soft text-[14px] break-all underline underline-offset-2">
            {p.url.replace(/^https:\/\/(www\.)?/, "")}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        <p className={cn("rounded-md px-2 py-1 text-[13px] font-semibold tabular-nums", (p.score ?? 100) < 60 ? "bg-(--tag-amber-bg) text-(--tag-amber-text)" : "text-soft bg-white/[0.06]")}>
          {p.score ?? "–"} of 100
        </p>
      </div>
      {p.findings.length ? (
        <ul aria-label={`Problems found on ${p.company}`} className="flex list-disc flex-col gap-1 pl-5 text-[14px]">
          {p.findings.slice(0, 5).map((f) => (
            <li key={f.id}>
              {f.title} <span className="text-soft">(WCAG {f.wcag})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-soft text-[14px]">The quick check found nothing. A full audit with a screen reader may still find problems.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-st`} className="text-soft text-[13px]">
            Stage
          </label>
          <select
            id={`${id}-st`}
            value={stage}
            onChange={(e) => {
              const v = e.target.value;
              setStage(v);
              start(async () => {
                const r = await setProspectStatus(p.id, v);
                setMsg(r.ok ? "Saved." : r.error);
              });
            }}
            className={cn(FIELD, "w-auto cursor-pointer pr-8")}
          >
            {STAGES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {p.findings.length > 0 && (
          <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-4" aria-disabled={pending} onClick={draft}>
            Draft the email<span className="sr-only"> to {p.company}</span>
          </Button>
        )}
        {sure ? (
          <>
            <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-3" onClick={() => start(async () => void (await removeProspect(p.id)))}>
              Yes, remove {p.company}
            </Button>
            <Button type="button" variant="ghost" size="md" className="h-11 px-3" onClick={() => setSure(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => setSure(true)}>
            Remove<span className="sr-only"> {p.company}</span>
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
        {msg}
      </p>
      {text && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-txt`} className="text-[14px] font-medium">
            The email
          </label>
          <textarea id={`${id}-txt`} readOnly value={text} rows={12} className="border-line-strong bg-background/40 w-full rounded-xl border p-3 font-mono text-[13px] leading-relaxed" />
        </div>
      )}
    </li>
  );
}
