"use client";

import { useId, useRef, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import { FIELD } from "@/components/learn/add-note";
import { type CoachResult, runCoach } from "@/app/(crm)/coach/actions";
import { type Coached, TOOLS, type ToolId } from "@/lib/coach/coach";

type JobOption = { id: string; label: string };
const CARD = "rounded-2xl bg-white/[0.04] outline outline-1 -outline-offset-1 outline-white/[0.06]";

function Result({ coached, note, onPractise }: { coached: Coached; note: string; onPractise?: (q: string) => void }) {
  const [copied, setCopied] = useState("");
  async function copy(title: string, items: string[]) {
    try {
      await navigator.clipboard.writeText(items.join("\n\n"));
      setCopied(`${title} copied.`);
    } catch {
      setCopied("Copying is blocked here. Select the text instead.");
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {coached.score !== undefined && (
        <p className="flex items-baseline gap-2">
          <span className="text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{coached.score}</span>
          <span className="text-soft text-[15px]">out of {coached.score > 10 ? 100 : 10}</span>
        </p>
      )}
      {coached.sections.map((s) => {
        const questions = onPractise && /question/i.test(s.title);
        return (
          <section key={s.title} className={`${CARD} flex flex-col gap-3 p-4`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[16px] font-semibold">{s.title}</h3>
              <Button variant="ghost" size="md" className="h-10 shrink-0 px-3" onClick={() => copy(s.title, s.items)}>
                Copy<span className="sr-only"> {s.title}</span>
              </Button>
            </div>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-normal">
              {s.items.map((i) => (
                <li key={i} className="pl-1">
                  <span className="whitespace-pre-line">{i}</span>
                  {questions && (
                    <Button variant="ghost" size="md" className="ml-2 h-9 px-2 text-[14px]" onClick={() => onPractise(i)}>
                      Answer this<span className="sr-only">: {i}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      <p className="text-soft text-[13px]">{note}</p>
      <p role="status" aria-live="polite" className="text-soft text-[13px] empty:hidden">
        {copied}
      </p>
    </div>
  );
}

export default function Coach({ jobs, firstRole }: { jobs: JobOption[]; firstRole: string }) {
  const id = useId();
  const [tool, setTool] = useState<ToolId>("shortlist");
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [jobText, setJobText] = useState("");
  const [role, setRole] = useState(firstRole);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<CoachResult | null>(null);
  const [pending, start] = useTransition();
  const [practising, startPractice] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const def = TOOLS.find((t) => t.id === tool)!;

  function choose(t: ToolId) {
    setTool(t);
    setResult(null);
    setQuestion("");
    setFeedback(null);
  }

  function run() {
    if (pending) return;
    start(async () => {
      const r = await runCoach(tool, { jobId: jobText.trim() ? undefined : jobId, jobText, role });
      setResult(r);
      requestAnimationFrame(() => {
        if (!r.ok && r.field) document.getElementById(`${id}-${r.field}`)?.focus();
        else resultRef.current?.focus();
      });
    });
  }

  function practise(q: string) {
    setQuestion(q);
    setAnswer("");
    setFeedback(null);
    requestAnimationFrame(() => answerRef.current?.focus());
  }

  function judge() {
    if (practising) return;
    startPractice(async () => {
      const r = await runCoach("feedback", { jobId: jobText.trim() ? undefined : jobId, jobText, question, answer });
      setFeedback(r);
    });
  }

  const err = result && !result.ok ? result : null;
  const bad = (f: "job" | "role" | "answer") => (err?.field === f ? { "aria-invalid": true as const, "aria-describedby": `${id}-err` } : {});

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17em_minmax(0,1fr)]">
      <nav aria-label="Coach tools">
        <ul className="flex flex-col gap-1">
          {TOOLS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-current={t.id === tool ? "true" : undefined}
                onClick={() => choose(t.id)}
                className={`focus-visible:ring-ring flex min-h-11 w-full items-center rounded-xl px-3 text-left text-[14px] outline-none focus-visible:ring-2 ${t.id === tool ? "bg-white/[0.09] font-medium" : "text-soft hover:text-foreground hover:bg-white/[0.05]"}`}
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby={`${id}-h`} className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 id={`${id}-h`} className="text-[24px] font-semibold tracking-[-0.02em]">
            {def.title}
          </h2>
          <p className="text-soft max-w-[40em] text-[15px] leading-normal">{def.what}</p>
        </div>

        <div className={`${CARD} flex flex-col gap-4 p-4 sm:p-5`}>
          {def.needs === "job" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-job`} className="text-[15px] font-medium">
                  A job you saved
                </label>
                <select id={`${id}-job`} value={jobId} onChange={(e) => setJobId(e.target.value)} className={FIELD} {...bad("job")}>
                  {jobs.length === 0 && <option value="">No saved jobs yet</option>}
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-text`} className="text-[15px] font-medium">
                  Or paste a job post (optional)
                </label>
                <textarea id={`${id}-text`} value={jobText} onChange={(e) => setJobText(e.target.value)} rows={5} maxLength={8000} className={`${FIELD} h-auto py-2`} aria-describedby={`${id}-text-hint`} />
                <p id={`${id}-text-hint`} className="text-soft text-[13px]">
                  A pasted post is used instead of the saved job.
                </p>
              </div>
            </>
          )}
          {def.needs === "role" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-role`} className="text-[15px] font-medium">
                Target role (required)
              </label>
              <input id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} className={FIELD} {...bad("role")} />
            </div>
          )}
          {def.needs === "none" && <p className="text-soft text-[14px]">This uses your Profile. The fuller it is, the better the answer.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md" className="h-11 rounded-xl px-5" aria-disabled={pending} onClick={run}>
              {pending ? "Thinking…" : def.button}
            </Button>
            <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
              {pending ? "This takes 10 to 30 seconds." : ""}
            </p>
          </div>
          {err && (
            <p id={`${id}-err`} role="alert" className="text-danger text-[14px]">
              {err.error}
            </p>
          )}
        </div>

        {result?.ok && (
          <div ref={resultRef} tabIndex={-1} className="flex flex-col gap-4 outline-none" aria-label={`${def.title}: result`}>
            <Result coached={result.coached} note={result.note} onPractise={tool === "interview" ? practise : undefined} />
          </div>
        )}

        {tool === "interview" && question && (
          <section aria-labelledby={`${id}-p`} className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`}>
            <h3 id={`${id}-p`} className="text-[17px] font-semibold">
              Your answer
            </h3>
            <p className="text-[15px] leading-normal">{question}</p>
            <label htmlFor={`${id}-answer`} className="text-[15px] font-medium">
              Answer as you would say it (required)
            </label>
            <textarea id={`${id}-answer`} ref={answerRef} value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} maxLength={4000} className={`${FIELD} h-auto py-2`} aria-describedby={`${id}-answer-hint`} />
            <p id={`${id}-answer-hint`} className="text-soft text-[13px]">
              Use STAR: the Situation, your Task, the Action you took, and the Result.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="md" className="h-11 rounded-xl px-5" aria-disabled={practising} onClick={judge}>
                {practising ? "Reading your answer…" : "Get feedback"}
              </Button>
            </div>
            {feedback && !feedback.ok && (
              <p role="alert" className="text-danger text-[14px]">
                {feedback.error}
              </p>
            )}
            {feedback?.ok && <Result coached={feedback.coached} note={feedback.note} />}
          </section>
        )}
      </section>
    </div>
  );
}
