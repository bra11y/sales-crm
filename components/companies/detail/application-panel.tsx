"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import DetailSection from "./detail-section";
import { type ApplicationEntry, getApplicationHistory, moveApplication } from "@/app/(crm)/actions";
import { APPLICATION_STAGES } from "@/lib/crm/application-stage";
import type { Company } from "@/data/companies";
import { useCompaniesStore } from "@/stores/companies-store";

const CONTROL =
  "w-full rounded-lg border border-line-strong bg-secondary px-3 text-[14px] text-foreground outline-none transition-[border-color] duration-150 ease-power3-out focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

const DOC_LABELS = { cv: "CV", cover: "Cover letter", proposal: "Proposal" } as const;

function when(at: string) {
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ApplicationPanel({ company }: { company: Company }) {
  const updateCompany = useCompaniesStore((state) => state.updateCompany);
  const current = APPLICATION_STAGES.find((s) => company.tags.includes(s)) ?? "Applied";
  const [stage, setStage] = useState<string>(current);
  const [note, setNote] = useState("");
  const [entries, setEntries] = useState<ApplicationEntry[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getApplicationHistory(company.id).then((result) => {
      if (!live) return;
      if (result.ok) setEntries(result.entries);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [company.id]);

  function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await moveApplication(company.id, stage, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      updateCompany(result.company);
      setNote("");
      setMessage(`Saved. ${company.name} is now at ${stage}.`);
      const history = await getApplicationHistory(company.id);
      if (history.ok) setEntries(history.entries);
    });
  }

  return (
    <>
      <DetailSection title="Move this application">
        <form onSubmit={save} className="flex flex-col gap-3">
          <Field label="Stage" htmlFor="application-stage">
            <select
              id="application-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className={`${CONTROL} h-9`}
            >
              {APPLICATION_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="What happened"
            htmlFor="application-note"
            hint="Optional. For example: Interview with Ada on Tuesday at 3pm."
          >
            <textarea
              id="application-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              aria-describedby="application-note-hint"
              className={`${CONTROL} py-2 leading-normal`}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save stage"}
            </Button>
            <p role="status" aria-live="polite" className="caption-style text-subtle">
              {message}
            </p>
          </div>
          {error && (
            <p role="alert" className="caption-style text-danger">
              {error}
            </p>
          )}
        </form>
      </DetailSection>

      <DetailSection title="History and sent documents">
        {entries === null && !error && <p className="lead-style text-subtle">Loading history…</p>}
        {entries?.length === 0 && <p className="lead-style text-subtle">Nothing recorded yet.</p>}
        {entries && entries.length > 0 && (
          <ol className="flex flex-col gap-4">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 rounded-lg p-3 shadow-[0px_0px_0px_1px_#333333]">
                <p className="caption-style text-subtle">
                  <time dateTime={entry.at}>{when(entry.at)}</time>
                </p>
                <p className="lead-style text-foreground">{entry.summary}</p>
                {entry.documents &&
                  (Object.keys(DOC_LABELS) as (keyof typeof DOC_LABELS)[])
                    .filter((key) => entry.documents?.[key])
                    .map((key) => (
                      <details key={key} className="rounded-md bg-secondary">
                        <summary className="lead-style cursor-pointer px-3 py-2 text-foreground">
                          {DOC_LABELS[key]} sent{entry.role ? ` for ${entry.role}` : ""}
                        </summary>
                        <pre className="caption-style max-h-80 overflow-auto px-3 pb-3 whitespace-pre-wrap text-soft">
                          {entry.documents?.[key]?.replace(/^<!--[\s\S]*?-->\s*/, "")}
                        </pre>
                      </details>
                    ))}
                {entry.jobPost && (
                  <details className="rounded-md bg-secondary">
                    <summary className="lead-style cursor-pointer px-3 py-2 text-foreground">Job post</summary>
                    <pre className="caption-style max-h-80 overflow-auto px-3 pb-3 whitespace-pre-wrap text-soft">
                      {entry.jobPost}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </DetailSection>
    </>
  );
}
