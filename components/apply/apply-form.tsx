"use client";

import { type FormEvent, useState, useTransition } from "react";
import { Packer } from "docx";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import Tag from "@/components/_ui/tag";
import F from "@/lib/apply/facts.js";
import E from "@/lib/apply/engine.js";
import R from "@/lib/apply/render.js";
import { PRINT_CSS } from "@/lib/apply/print-css";
import { saveApplication } from "@/app/(crm)/apply/actions";

const CONTROL =
  "w-full rounded-lg border border-line-strong bg-secondary px-3 text-[14px] text-foreground outline-none transition-[border-color] duration-150 ease-power3-out focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

const DOCS = [
  { key: "cv", name: "CV", make: E.makeCV },
  { key: "cover", name: "Cover letter", make: E.makeCover },
  { key: "proposal", name: "Proposal", make: E.makeProposal },
] as const;
type DocKey = (typeof DOCS)[number]["key"];

type Analysis = {
  track: "accessibility" | "frontend" | "design";
  matched: { label: string }[];
  gaps: string[];
  contract: boolean;
  currency: "usd" | "ngn";
  guess: { company: string; role: string };
};

const stripMeta = (md: string) => md.replace(/^<!--[\s\S]*?-->\s*/, "");

export default function ApplyForm() {
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [manager, setManager] = useState("");
  const [why, setWhy] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [track, setTrack] = useState("");
  const [want, setWant] = useState<Record<DocKey, boolean>>({ cv: true, cover: true, proposal: false });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<DocKey, string>>>({});
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function say(text: string) {
    setAlert("");
    setStatus(text);
  }
  function warn(text: string) {
    setStatus("");
    setAlert(text);
  }

  function fillGuesses() {
    if (!jd.trim()) return;
    const g = (E.analyze(jd, F) as Analysis).guess;
    if (!company) setCompany(g.company);
    if (!role) setRole(g.role);
  }

  function read(event: FormEvent) {
    event.preventDefault();
    if (!jd.trim()) {
      warn("Paste a job post first. The job post box is required.");
      document.getElementById("apply-jd")?.focus();
      return;
    }
    const a = E.analyze(jd, F) as Analysis;
    if (track) a.track = track as Analysis["track"];
    const nextWant = a.contract ? { ...want, proposal: true } : want;
    if (a.currency === "ngn") setCurrency("NGN");
    const o = { jd, company: company.trim(), role: role.trim(), manager: manager.trim(), why: why.trim() };
    const next: Partial<Record<DocKey, string>> = {};
    for (const d of DOCS) if (nextWant[d.key]) next[d.key] = d.make(a, o, F);
    setWant(nextWant);
    setAnalysis(a);
    setDrafts(next);
    setSaved(false);
    say("Drafts ready. Check the notes on each one, then save the application.");
    requestAnimationFrame(() => document.getElementById("apply-results")?.focus());
  }

  function edit(key: DocKey, text: string) {
    setDrafts((d) => ({ ...d, [key]: text }));
    setSaved(false);
  }

  async function download(key: DocKey, name: string) {
    try {
      const blob = await Packer.toBlob(R.toDocx(drafts[key] ?? ""));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Bryan-Onyenghan-${name.replace(/\s+/g, "-")}-${E.slug(company)}.docx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      say(`${name} downloaded as ${link.download}.`);
    } catch (err) {
      warn(`Could not make the ${name}: ${(err as Error).message}`);
    }
  }

  function print(key: DocKey, name: string) {
    const frame = document.createElement("iframe");
    frame.title = `${name} print preview`;
    frame.hidden = true;
    document.body.append(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(R.toHtml(drafts[key] ?? "", PRINT_CSS));
    doc.close();
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 60_000);
    say(`Print window opened for the ${name.toLowerCase()}. Choose Save as PDF.`);
  }

  async function copy(key: DocKey, name: string) {
    try {
      await navigator.clipboard.writeText(stripMeta(drafts[key] ?? ""));
      say(`${name} text copied.`);
    } catch {
      warn("Copy did not work in this browser. Select the text and copy it by hand.");
    }
  }

  function save() {
    if (!analysis || saved || pending) return;
    startTransition(async () => {
      const result = await saveApplication({
        company,
        role,
        manager,
        track: F.tracks[analysis.track].label,
        contract: analysis.contract || want.proposal,
        documents: drafts,
        jd,
        matched: analysis.matched.map((m) => m.label),
        gaps: analysis.gaps,
        value,
        currency,
      });
      if (!result.ok) {
        warn(`Not saved: ${result.error}`);
        return;
      }
      setSaved(true);
      say(`Saved. ${result.companyName} is in Companies under Applications, at the Applied stage.`);
    });
  }

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <form onSubmit={read} aria-labelledby="apply-form-heading" className="flex flex-col gap-4">
        <h2 id="apply-form-heading">The job</h2>
        <Field label="Job post or project brief" htmlFor="apply-jd" required hint="Required. Paste the whole post, bullet points included.">
          <textarea
            id="apply-jd"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            onBlur={fillGuesses}
            required
            aria-required="true"
            aria-describedby="apply-jd-hint"
            rows={12}
            className={`${CONTROL} py-2 leading-normal`}
          />
        </Field>
        <Field label="Company or client name" htmlFor="apply-company">
          <Input id="apply-company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
        </Field>
        <Field label="Role title or project name" htmlFor="apply-role" hint={'Level words like "Senior" are left off your CV.'}>
          <Input id="apply-role" value={role} onChange={(e) => setRole(e.target.value)} aria-describedby="apply-role-hint" />
        </Field>
        <Field label="Hiring manager or contact name" htmlFor="apply-manager" hint="Optional. Saved as the contact.">
          <Input id="apply-manager" value={manager} onChange={(e) => setManager(e.target.value)} aria-describedby="apply-manager-hint" autoComplete="off" />
        </Field>
        <Field label="Deal value" htmlFor="apply-value" hint="Optional. The salary or contract amount, for your pipeline total.">
          <div className="flex gap-2">
            <Input id="apply-value" type="number" min={0} step={1} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-describedby="apply-value-hint" />
            <label htmlFor="apply-currency" className="sr-only">
              Currency
            </label>
            <select id="apply-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${CONTROL} h-9 w-auto`}>
              <option value="USD">USD</option>
              <option value="NGN">NGN</option>
            </select>
          </div>
        </Field>
        <Field label="Why this company, in one true sentence" htmlFor="apply-why" hint="Optional, but it makes the cover letter yours.">
          <textarea id="apply-why" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} aria-describedby="apply-why-hint" className={`${CONTROL} py-2 leading-normal`} />
        </Field>
        <Field label="Role type" htmlFor="apply-track">
          <select id="apply-track" value={track} onChange={(e) => setTrack(e.target.value)} className={`${CONTROL} h-9`}>
            <option value="">Pick for me from the job post</option>
            <option value="accessibility">Accessibility</option>
            <option value="frontend">Front-end developer</option>
            <option value="design">Product or UX designer</option>
          </select>
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-foreground mb-1 text-[14px] font-medium">Make</legend>
          {DOCS.map((d) => (
            <label key={d.key} className="text-foreground flex min-h-8 items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={want[d.key]}
                onChange={(e) => setWant((w) => ({ ...w, [d.key]: e.target.checked }))}
                className="accent-primary size-5"
              />
              {d.name}
            </label>
          ))}
        </fieldset>
        <Button type="submit" variant="primary" size="md" className="self-start">
          Read the job post
        </Button>
      </form>

      <section id="apply-results" tabIndex={-1} aria-labelledby="apply-results-heading" className="flex flex-col gap-5 outline-none">
        <h2 id="apply-results-heading">Check and save</h2>
        {!analysis && <p className="text-subtle">Your match report and drafts appear here.</p>}

        {analysis && (
          <>
            <p className="text-foreground">
              Role type: {F.tracks[analysis.track].label}. {analysis.matched.length} of your skills match.
              {analysis.contract && " It reads like a contract, so a proposal is ticked."}
              {analysis.matched.length < 3 && " Few of your skills match. This post may be outside your field."}
            </p>
            <div className="flex flex-col gap-2">
              <h3 id="apply-matched-heading" className="text-[14px] font-medium">Skills of yours this post asks for</h3>
              <ul aria-labelledby="apply-matched-heading" className="flex flex-wrap gap-1.5">
                {analysis.matched.map((m) => (
                  <li key={m.label}>
                    <Tag tone="green" size="sm">
                      {m.label}
                    </Tag>
                  </li>
                ))}
              </ul>
            </div>
            {analysis.gaps.length > 0 && (
              <div className="rounded-lg border border-(--tag-amber-border) bg-(--tag-amber-bg) p-3 text-(--tag-amber-text)">
                <p>
                  <strong>The post asks for tools you have not used:</strong> {analysis.gaps.join(", ")}. They are left out of every document. Be ready to say so honestly.
                </p>
              </div>
            )}
          </>
        )}

        {DOCS.filter((d) => drafts[d.key] !== undefined).map((d) => {
          const notes: string[] = E.lint(drafts[d.key] ?? "");
          return (
            <div key={d.key} className="border-line-strong flex flex-col gap-3 border-t pt-5">
              <h3>{d.name}</h3>
              {notes.length > 0 && (
                <div id={`apply-lint-${d.key}`} className="rounded-lg border border-(--tag-amber-border) bg-(--tag-amber-bg) p-3 text-(--tag-amber-text)">
                  <strong>Before you send:</strong>
                  <ul className="list-disc pl-5">
                    {notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Field label={`Edit the ${d.key === "cv" ? "CV" : d.name.toLowerCase()} text`} htmlFor={`apply-md-${d.key}`}>
                <textarea
                  id={`apply-md-${d.key}`}
                  value={drafts[d.key]}
                  onChange={(e) => edit(d.key, e.target.value)}
                  rows={14}
                  aria-describedby={notes.length ? `apply-lint-${d.key}` : undefined}
                  className={`${CONTROL} py-2 font-mono text-[13px] leading-normal`}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="md" onClick={() => download(d.key, d.name)}>
                  Download {d.key === "cv" ? "CV" : d.name.toLowerCase()} as Word
                </Button>
                <Button type="button" variant="secondary" size="md" onClick={() => print(d.key, d.name)}>
                  Save as PDF
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={() => copy(d.key, d.name)}>
                  Copy text
                </Button>
              </div>
            </div>
          );
        })}

        {analysis && (
          <div className="border-line-strong flex flex-wrap items-center gap-3 border-t pt-5">
            <Button type="button" variant="primary" size="md" onClick={save} aria-disabled={pending || saved}>
              {saved ? "Saved to Companies" : pending ? "Saving…" : "Save application"}
            </Button>
            {saved && (
              <Button variant="link" size="none" href="/">
                Open Companies
              </Button>
            )}
          </div>
        )}

        <p role="status" aria-live="polite" className="text-subtle">
          {status}
        </p>
        <p role="alert" className="text-danger">
          {alert}
        </p>
      </section>
    </div>
  );
}
