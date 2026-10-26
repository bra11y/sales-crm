"use client";

import { type FormEvent, useId, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { Packer } from "docx";
import Button from "@/components/_ui/button";
import { extensionVersion, noSubscribe, startWithExtension } from "@/components/jobs/extension";
import SEED from "@/lib/apply/facts.js";
import E from "@/lib/apply/engine.js";
import R from "@/lib/apply/render.js";
import { PRINT_CSS } from "@/lib/apply/print-css";
import { saveApplication } from "@/app/(crm)/apply/actions";
import { hydrateFacts, type StoredFacts } from "@/lib/jobs/facts";
import { atsCheck } from "@/lib/apply/ats";
import { findReadCheck, withReadLine } from "@/lib/apply/compose";
import ReadCheckBox from "@/components/apply/read-check";
import { cn } from "@/lib/utils";

// Apple-style grouped layout: the job post first, extra details one level deeper,
// then a live preview of each document with its actions underneath.

const FIELD =
  "w-full rounded-xl border border-line-strong bg-secondary px-3 text-[15px] text-foreground outline-none transition-[border-color] duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";
const GROUP = "flex flex-col divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.04]";
const PRIMARY = "h-12 rounded-xl px-6 text-[15px] active:scale-[0.98] motion-reduce:active:scale-100";

const DOCS = [
  { key: "cv", name: "CV", make: E.makeCV },
  { key: "cover", name: "Cover letter", make: E.makeCover },
  { key: "proposal", name: "Proposal", make: E.makeProposal },
] as const;
type DocKey = (typeof DOCS)[number]["key"];

type Analysis = {
  track: "accessibility" | "frontend" | "design";
  matched: { label: string; said: string }[];
  gaps: string[];
  contract: boolean;
  currency: "usd" | "ngn";
  guess: { company: string; role: string; contact: { name: string; first: string } | null };
};

const stripMeta = (md: string) => md.replace(/^<!--[\s\S]*?-->\s*/, "");

export type ApplyStart = { jobId: string; jd: string; company: string; role: string };

export default function ApplyForm({ facts, start }: { facts?: StoredFacts; start?: ApplyStart }) {
  const id = useId();
  const F = useMemo(() => (facts ? hydrateFacts(facts) : SEED) as typeof SEED, [facts]);
  const [jd, setJd] = useState(start?.jd ?? "");
  const [company, setCompany] = useState(start?.company ?? "");
  const [role, setRole] = useState(start?.role ?? "");
  const [manager, setManager] = useState("");
  const [why, setWhy] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [track, setTrack] = useState("");
  const [want, setWant] = useState<Record<DocKey, boolean>>({ cv: true, cover: true, proposal: false });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<DocKey, string>>>({});
  const [shown, setShown] = useState<DocKey>("cv");
  const [shape, setShape] = useState("");
  const [seed, setSeed] = useState(0);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const person = (F as { person?: { name?: string } }).person?.name ?? "CV";

  function say(text: string) {
    setAlert("");
    setStatus(text);
  }
  function warn(text: string) {
    setStatus("");
    setAlert(text);
  }

  function read(event: FormEvent) {
    event.preventDefault();
    if (!jd.trim()) {
      warn("Paste a job post first. The job post box is required.");
      document.getElementById(`${id}-jd`)?.focus();
      return;
    }
    if (!Object.values(want).some(Boolean)) {
      warn("Pick at least one document to make.");
      return;
    }
    const a = E.analyze(jd, F) as Analysis;
    if (track) a.track = track as Analysis["track"];
    const name = company.trim() || a.guess.company;
    const title = role.trim() || a.guess.role;
    if (!company.trim()) setCompany(name);
    if (!role.trim()) setRole(title);
    const nextWant = a.contract ? { ...want, proposal: true } : want;
    if (a.currency === "ngn") setCurrency("NGN");
    // The recruiter the post names fills the Contact box, so the letter greets them.
    const contact = manager.trim() || a.guess.contact?.name || "";
    if (!manager.trim() && contact) setManager(contact);
    const o = { jd, company: name, role: title, manager: contact, why: why.trim(), shape, seed };
    const next: Partial<Record<DocKey, string>> = {};
    for (const d of DOCS) if (nextWant[d.key]) next[d.key] = d.make(a, o, F);
    // A read-check you already confirmed stays in the rebuilt letter.
    if (readLine && next.cover) next.cover = withReadLine(next.cover, readLine);
    setWant(nextWant);
    setAnalysis(a);
    setDrafts(next);
    setShown((DOCS.find((d) => next[d.key] !== undefined)?.key ?? "cv") as DocKey);
    setEditing(false);
    setSaved(false);
    say(`Your documents are ready.${!manager.trim() && contact ? ` The letter greets ${contact}, named in the post.` : ""} Read each one, then save the application.`);
    requestAnimationFrame(() => document.getElementById(`${id}-results`)?.focus());
  }

  // A new letter style or wording, keeping everything else.
  function reword(nextShape: string, nextSeed: number) {
    setShape(nextShape);
    setSeed(nextSeed);
    if (!analysis || drafts.cover === undefined) return;
    const o = { jd, company, role, manager: manager.trim(), why: why.trim(), shape: nextShape, seed: nextSeed };
    const cover = E.makeCover(analysis, o, F) as string;
    setDrafts((d) => ({ ...d, cover: readLine ? withReadLine(cover, readLine) : cover }));
    setSaved(false);
    say(`New cover letter: ${E.SHAPES[E.letterShape(analysis, o) as keyof typeof E.SHAPES]}.`);
  }

  function edit(key: DocKey, text: string) {
    setDrafts((d) => ({ ...d, [key]: text }));
    setSaved(false);
  }

  const fileName = (name: string) => `${person.replace(/\s+/g, "-")}-${name.replace(/\s+/g, "-")}-${E.slug(company)}`;

  async function download(key: DocKey, name: string) {
    try {
      const blob = await Packer.toBlob(R.toDocx(drafts[key] ?? ""));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${fileName(name)}.docx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      say(`${name} downloaded as ${link.download}.`);
    } catch (err) {
      warn(`Could not make the ${name}: ${(err as Error).message}`);
    }
  }

  // The server makes a tagged PDF: screen readers can follow it and ATS parsers read it in order.
  async function pdf(key: DocKey, name: string) {
    try {
      const res = await fetch("/api/apply/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ markdown: drafts[key] ?? "", title: `${person} ${name}` }) });
      if (!res.ok) throw new Error(res.status === 401 ? "sign in again" : "the server could not make it");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await res.blob());
      link.download = `${fileName(name)}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      say(`${name} downloaded as ${link.download}.`);
    } catch (err) {
      warn(`Could not make the ${name} PDF: ${(err as Error).message}. Try again.`);
    }
  }

  async function copy(key: DocKey, name: string) {
    try {
      await navigator.clipboard.writeText(stripMeta(drafts[key] ?? ""));
      say(`${name} text copied.`);
    } catch {
      warn("Copy did not work in this browser. Select the text and copy it by hand.");
    }
  }

  const extension = useSyncExternalStore(noSubscribe, extensionVersion, () => "");

  function launch() {
    if (!start?.jobId || pending) return;
    startTransition(async () => {
      say("Opening the application in a new tab…");
      const r = await startWithExtension(start.jobId);
      if (!r.ok) warn(r.error ?? "The extension did not start.");
      else say("A new tab opened. The panel at the bottom right fills the form and saves the proof when you press Submit.");
    });
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
        jobId: start?.jobId,
      });
      if (!result.ok) {
        warn(`Not saved: ${result.error}`);
        return;
      }
      setSaved(true);
      say(`Marked as applied. ${result.companyName} is on your Applications board, and its replies will move it on by themselves.`);
    });
  }

  const made = DOCS.filter((d) => drafts[d.key] !== undefined);
  const current = made.find((d) => d.key === shown) ?? made[0];
  const notes: string[] = current ? E.lint(drafts[current.key] ?? "") : [];
  const ats = useMemo(
    () => (analysis && drafts.cv ? atsCheck(drafts.cv, jd, { role, matched: analysis.matched.map((m) => m.label), said: analysis.matched.map((m) => m.said), gaps: analysis.gaps }) : null),
    [analysis, drafts.cv, jd, role],
  );
  const readCheck = useMemo(() => (analysis ? findReadCheck(jd) : null), [analysis, jd]);
  const [readLine, setReadLine] = useState<{ word: string; tag: string } | null>(null);
  function confirmRead(read: boolean, v: { word: string; tag: string }) {
    setReadLine(read ? v : null);
    const strip = (t: string) =>
      t
        .split("\n")
        .filter((l) => !l.startsWith("P.S. I read the whole post"))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");
    setDrafts((d) => (d.cover === undefined ? d : { ...d, cover: read ? withReadLine(strip(d.cover), v) : strip(d.cover) }));
    say(read ? "Added to your cover letter, just above the sign-off." : "Taken out of your cover letter.");
  }
  const coverShape = drafts.cover?.match(/shape:\s*(\w+)/)?.[1] ?? "";
  const fit = analysis ? Math.min(100, Math.round((analysis.matched.length / Math.max(1, analysis.matched.length + analysis.gaps.length)) * 100)) : 0;

  return (
    <div className={cn("grid grid-cols-1 items-start gap-8", analysis && "xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]")}>
      <form onSubmit={read} aria-labelledby={`${id}-job`} className={cn("flex w-full flex-col gap-5", !analysis && "max-w-[40rem]")}>
        <h2 id={`${id}-job`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
          1. The job
        </h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-jd`} className="px-1 text-[15px] font-medium">
            Job post or project brief (required)
          </label>
          <textarea
            id={`${id}-jd`}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            required
            rows={analysis ? 8 : 12}
            aria-describedby={`${id}-jd-hint`}
            placeholder="Paste the whole post, bullet points included."
            className={`${FIELD} py-3 leading-relaxed`}
          />
          <p id={`${id}-jd-hint`} className="text-soft px-1 text-[13px]">
            Only your true facts are used. Tools you have not used are left out.
          </p>
        </div>

        <div className={GROUP}>
          <Row label="Company" htmlFor={`${id}-company`}>
            <input id={`${id}-company`} value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" placeholder="Found in the post" className={ROW_INPUT} />
          </Row>
          <Row label="Role" htmlFor={`${id}-role`}>
            <input id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Found in the post" className={ROW_INPUT} />
          </Row>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 px-1 text-[15px] font-medium">Make</legend>
          <div className={GROUP}>
            {DOCS.map((d) => (
              <label key={d.key} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 text-[15px]">
                {d.name}
                <input type="checkbox" checked={want[d.key]} onChange={(e) => setWant((w) => ({ ...w, [d.key]: e.target.checked }))} className="accent-primary size-5" />
              </label>
            ))}
          </div>
        </fieldset>

        <details className="group flex flex-col">
          <summary className="text-soft hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 text-[15px] outline-none focus-visible:ring-2">
            <span aria-hidden className="inline-block transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none">
              ›
            </span>
            More details (optional)
          </summary>
          <div className="mt-2 flex flex-col gap-4">
            <div className={GROUP}>
              <Row label="Contact" htmlFor={`${id}-manager`}>
                <input id={`${id}-manager`} value={manager} onChange={(e) => setManager(e.target.value)} autoComplete="off" placeholder="Hiring manager" className={ROW_INPUT} />
              </Row>
              <Row label="Value" htmlFor={`${id}-value`}>
                <span className="flex items-center gap-2">
                  <input
                    id={`${id}-value`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Salary or fee"
                    className={ROW_INPUT}
                  />
                  <label htmlFor={`${id}-currency`} className="sr-only">
                    Currency
                  </label>
                  <select
                    id={`${id}-currency`}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="focus-visible:ring-ring rounded-md bg-transparent text-[15px] outline-none focus-visible:ring-2"
                  >
                    <option value="USD">USD</option>
                    <option value="NGN">NGN</option>
                  </select>
                </span>
              </Row>
              <Row label="Role type" htmlFor={`${id}-track`}>
                <select id={`${id}-track`} value={track} onChange={(e) => setTrack(e.target.value)} className={`${ROW_INPUT} cursor-pointer`}>
                  <option value="">Pick from the post</option>
                  <option value="accessibility">Accessibility</option>
                  <option value="frontend">Front-end developer</option>
                  <option value="design">Product or UX designer</option>
                </select>
              </Row>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-why`} className="px-1 text-[15px] font-medium">
                Why this company, in one true sentence
              </label>
              <textarea id={`${id}-why`} value={why} onChange={(e) => setWhy(e.target.value)} rows={2} aria-describedby={`${id}-why-hint`} className={`${FIELD} py-2.5 leading-normal`} />
              <p id={`${id}-why-hint`} className="text-soft px-1 text-[13px]">
                It makes the cover letter yours, not a template.
              </p>
            </div>
          </div>
        </details>

        <Button type="submit" variant="primary" size="md" className={cn(PRIMARY, "w-full")}>
          {analysis ? "Build again" : "Build my documents"}
        </Button>
        {!analysis && (
          <>
            <p role="status" aria-live="polite" className="text-soft empty:hidden">
              {status}
            </p>
            {alert && (
              <p role="alert" className="text-danger">
                {alert}
              </p>
            )}
          </>
        )}
      </form>

      {analysis && (
        <section id={`${id}-results`} tabIndex={-1} aria-labelledby={`${id}-check`} className="flex min-w-0 flex-col gap-5 outline-none">
          <h2 id={`${id}-check`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
            2. Check your documents
          </h2>

          <div className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                {analysis.matched.length} <span className="text-soft text-[17px] font-normal">of your skills match</span>
              </p>
              <p className="text-soft text-[14px]">
                {F.tracks[analysis.track].label}
                {analysis.contract ? " · Contract" : ""}
              </p>
            </div>
            <div
              role="meter"
              aria-label="How much of the post you cover"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={fit}
              aria-valuetext={`${fit}% of the skills named are yours`}
              className="h-2 overflow-hidden rounded-full bg-white/[0.1]"
            >
              <div className={cn("h-full rounded-full", fit >= 70 ? "bg-success" : fit >= 40 ? "bg-[#3987e5]" : "bg-warning")} style={{ width: `${fit}%` }} />
            </div>
            <ul aria-label="Your skills this post asks for" className="flex flex-wrap gap-1.5">
              {analysis.matched.map((m) => (
                <li key={m.label} className="rounded-full bg-(--tag-green-bg) px-2.5 py-1 text-[13px] text-(--tag-green-text)">
                  {m.label}
                </li>
              ))}
            </ul>
            {analysis.matched.length < 3 && <p className="text-warning text-[14px]">Few of your skills match. This post may be outside your field.</p>}
            {analysis.gaps.length > 0 && (
              <p className="rounded-xl bg-(--tag-amber-bg) px-3 py-2.5 text-[14px] leading-normal text-(--tag-amber-text)">
                <strong className="font-semibold">Not in your skills:</strong> {analysis.gaps.join(", ")}. They are left out of every document. Be ready to say so honestly.
              </p>
            )}
          </div>

          {readCheck && <ReadCheckBox key={jd} check={readCheck} level={3} onChange={confirmRead} />}

          {ats && (
            <section aria-labelledby={`${id}-ats`} className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id={`${id}-ats`} className="text-[17px] font-semibold">
                  ATS check for your CV
                </h3>
                <p className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                  {ats.score}
                  <span className="text-soft text-[17px] font-normal"> / 100</span>
                </p>
              </div>
              <div
                role="meter"
                aria-label="ATS score"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={ats.score}
                aria-valuetext={`${ats.score} out of 100`}
                className="h-2 overflow-hidden rounded-full bg-white/[0.1]"
              >
                <div className={cn("h-full rounded-full", ats.score >= 80 ? "bg-success" : ats.score >= 60 ? "bg-[#3987e5]" : "bg-warning")} style={{ width: `${ats.score}%` }} />
              </div>
              <ul className="flex flex-col divide-y divide-white/[0.06] text-[14px]">
                {ats.items.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 py-2">
                    <span className={cn("mt-0.5 w-12 shrink-0 text-[12px] font-semibold tracking-wide uppercase", i.ok ? "text-success" : "text-warning")}>{i.ok ? "Good" : "Fix"}</span>
                    <span className="min-w-0 flex-1 break-words">
                      <span className="font-medium">{i.label}.</span> <span className="text-soft">{i.detail}</span>
                    </span>
                    <span className="text-soft shrink-0 tabular-nums">
                      {i.points}/{i.max}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-soft text-[13px] leading-normal">The score shows what a tracking system can find. Never add a skill you do not have to raise it.</p>
            </section>
          )}

          {current && (
            <div className="flex flex-col gap-3">
              <div role="group" aria-label="Document to show" className="flex w-fit gap-1 rounded-xl bg-white/[0.06] p-1">
                {made.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={d.key === current.key}
                    onClick={() => setShown(d.key)}
                    className={cn(
                      "focus-visible:ring-ring min-h-10 rounded-lg px-4 text-[14px] outline-none focus-visible:ring-2",
                      d.key === current.key ? "bg-[#2e2e2e] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.4)]" : "text-soft hover:text-foreground",
                    )}
                  >
                    {d.name}
                  </button>
                ))}
              </div>

              {current.key === "cover" && analysis && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${id}-shape`} className="px-1 text-[14px] font-medium">
                      Letter style
                    </label>
                    <select id={`${id}-shape`} value={shape} onChange={(e) => reword(e.target.value, seed)} className={`${FIELD} h-11 w-auto cursor-pointer pr-8`}>
                      <option value="">Best fit for this post{coverShape && !shape ? ` (${E.SHAPES[coverShape as keyof typeof E.SHAPES]})` : ""}</option>
                      {Object.entries(E.SHAPES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v as string}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-4" onClick={() => reword(shape, seed + 1)}>
                    Try other wording
                  </Button>
                </div>
              )}

              {notes.length > 0 && (
                <div id={`${id}-lint`} className="rounded-xl bg-(--tag-amber-bg) px-4 py-3 text-[14px] text-(--tag-amber-text)">
                  <strong className="font-semibold">Before you send:</strong>
                  <ul className="mt-1 list-disc pl-5">
                    {notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {editing ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-md`} className="px-1 text-[15px] font-medium">
                    Edit the {current.key === "cv" ? "CV" : current.name.toLowerCase()} text
                  </label>
                  <textarea
                    id={`${id}-md`}
                    value={drafts[current.key]}
                    onChange={(e) => edit(current.key, e.target.value)}
                    rows={22}
                    aria-describedby={notes.length ? `${id}-lint` : undefined}
                    className={`${FIELD} py-3 font-mono text-[13px] leading-relaxed`}
                  />
                </div>
              ) : (
                <iframe
                  title={`${current.name} preview`}
                  sandbox=""
                  srcDoc={R.toHtml(drafts[current.key] ?? "", `${PRINT_CSS} body{background:#fff;margin:0}main{padding:40px 44px}`)}
                  className="h-[34rem] w-full rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
                />
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-4" onClick={() => setEditing(!editing)} aria-pressed={editing}>
                  {editing ? "Show preview" : "Edit text"}
                </Button>
                <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-4" onClick={() => download(current.key, current.name)}>
                  Word file
                </Button>
                <Button type="button" variant="secondary" size="md" className="h-11 rounded-xl px-4" onClick={() => pdf(current.key, current.name)}>
                  PDF
                </Button>
                <Button type="button" variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => copy(current.key, current.name)}>
                  Copy text
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-5">
            <h2 className="px-1 text-[20px] font-semibold tracking-[-0.015em]">3. Send it</h2>
            <p className="text-soft px-1 text-[14px] leading-normal">
              This page writes your documents. It does not send them. {start?.jobId ? "Send them one of these ways:" : "Download them, send them on the company's form or by email, then mark it here."}
            </p>
            {start?.jobId && !saved && (
              <div className="flex flex-wrap gap-2">
                {extension ? (
                  <Button type="button" variant="primary" size="md" className="h-11 rounded-xl px-4" onClick={launch} aria-disabled={pending}>
                    Apply with the extension
                  </Button>
                ) : (
                  <Button variant="secondary" size="md" className="h-11 rounded-xl px-4" href="/profile#extension">
                    Set up the extension to fill their form
                  </Button>
                )}
                <Button variant="secondary" size="md" className="h-11 rounded-xl px-4" href={`/jobs?open=${start.jobId}`}>
                  Send by email from the job
                </Button>
              </div>
            )}
            <Button
              type="button"
              variant={start?.jobId ? "ghost" : "primary"}
              size="md"
              className={cn(start?.jobId ? "h-11 self-start px-2" : PRIMARY, !start?.jobId && "w-full sm:w-auto sm:self-start")}
              onClick={save}
              aria-disabled={pending || saved}
            >
              {saved ? "Marked as applied" : pending ? "Saving…" : "I already sent it: mark as applied"}
            </Button>
            {saved && (
              <Button variant="link" size="none" href="/applications" className="self-start">
                See it on your Applications board
              </Button>
            )}
            <p role="status" aria-live="polite" className="text-soft empty:hidden">
              {status}
            </p>
            {alert && (
              <p role="alert" className="text-danger">
                {alert}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

const ROW_INPUT = "w-full min-w-0 bg-transparent text-right text-[15px] text-foreground outline-none placeholder:text-soft focus-visible:ring-2 focus-visible:ring-ring rounded-md";

function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-4 px-4">
      <label htmlFor={htmlFor} className="w-24 shrink-0 text-[15px]">
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
