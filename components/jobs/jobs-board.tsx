"use client";

import { useMemo, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/_ui/tabs";
import { findJobsNow, setJobStatus } from "@/app/(crm)/jobs/actions";
import type { CompanyInfo } from "@/lib/jobs/company";
import JobPeek from "./job-peek";
import { ago, BAND, payText, type Status, STATUS_LABEL, WHERE_LABEL } from "./labels";

export type JobItem = {
  id: string;
  source: string;
  title: string;
  company: string;
  company_logo: string | null;
  url: string;
  apply_url: string;
  description: string;
  location: string;
  employment_type: string;
  pay_monthly_usd: number | null;
  posted_at: string | null;
  first_seen_at: string;
  score: number;
  band: "strong" | "good" | "maybe";
  eligibility: string;
  track: string;
  matched: string[];
  gaps: string[];
  reasons: string[];
  flags: string[];
  hidden_reason: string | null;
  status: Status;
  company_info: CompanyInfo | null;
  contact_email: string | null;
  // An address the post asks you to send your application to. Null means it uses a form.
  apply_email: string | null;
};
export type LastRun = { started_at: string; finished_at: string | null; kept: number; added: number; errors: unknown[] };
export type SourceNames = Record<string, { name: string; home: string }>;

const CONTROL =
  "h-11 rounded-lg border border-line-strong bg-secondary px-3 text-[14px] text-foreground outline-none transition-[border-color] duration-150 ease-power3-out focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";
const WHERE_FILTERS = [
  { value: "", label: "Anywhere I can work" },
  { value: "worldwide", label: "Worldwide only" },
  { value: "region", label: "Africa or EMEA" },
  { value: "local", label: "In my city" },
  { value: "visa", label: "Visa sponsorship" },
];
const BOARD: Status[] = ["new", "saved", "applied", "replied"];

export default function JobsBoard({ initialJobs, lastRun, sources, loadError }: { initialJobs: JobItem[]; lastRun: LastRun | null; sources: SourceNames; loadError: boolean }) {
  const [changes, setChanges] = useState<Record<string, Partial<JobItem>>>({});
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState("");
  const [where, setWhere] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [emailOnly, setEmailOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatusText] = useState("");
  const [alert, setAlert] = useState("");
  const [searching, startSearch] = useTransition();

  const jobs = useMemo(() => initialJobs.map((j) => ({ ...j, ...changes[j.id] })), [initialJobs, changes]);
  const hiddenCount = jobs.filter((j) => j.hidden_reason).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        (showHidden || !j.hidden_reason) &&
        (showDismissed || j.status !== "dismissed") &&
        (!fit || (fit === "strong" ? j.band === "strong" : j.band !== "maybe")) &&
        (!where || j.eligibility === where) &&
        (!emailOnly || Boolean(j.apply_email)) &&
        (!q || `${j.title} ${j.company} ${j.matched.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [jobs, query, fit, where, showHidden, showDismissed, emailOnly]);
  const open = jobs.find((j) => j.id === openId) ?? null;

  function say(text: string) {
    setAlert("");
    setStatusText(text);
  }

  function search() {
    if (searching) return;
    startSearch(async () => {
      say("Searching job boards. This takes about 15 seconds.");
      const r = await findJobsNow();
      if (!r.ok) {
        setStatusText("");
        setAlert(r.error);
        return;
      }
      say(
        `Done. ${r.added} new job${r.added === 1 ? "" : "s"}, ${r.kept} that fit you in total.` +
          (r.errors ? ` ${r.errors} board${r.errors === 1 ? "" : "s"} did not answer and will be tried next time.` : ""),
      );
    });
  }

  async function move(id: string, next: Status) {
    const before = jobs.find((j) => j.id === id)?.status;
    setChanges((c) => ({ ...c, [id]: { ...c[id], status: next } }));
    const r = await setJobStatus(id, next);
    if (!r.ok) {
      setChanges((c) => ({ ...c, [id]: { ...c[id], status: before } }));
      setAlert(r.error);
      return;
    }
    say(`Moved to ${STATUS_LABEL[next]}.`);
  }

  function companyFound(id: string, info: CompanyInfo) {
    setChanges((c) => ({ ...c, [id]: { ...c[id], company_info: info } }));
  }

  return (
    <>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-[24px] leading-[1.1] font-semibold tracking-[-0.02em]">Jobs</h1>
          <p className="text-soft max-w-[44em] leading-normal">
            Remote jobs from 9 job boards, scored against your profile. Jobs under your pay floor or closed to where you live are hidden, and the reason is shown.
          </p>
          <p className="caption-style text-soft">
            {lastRun ? `Last search ${ago(lastRun.started_at).toLowerCase()}, ${new Date(lastRun.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. ` : "No search yet. "}
            The app also searches by itself every day at 7:00 Abuja time.
          </p>
        </div>
        <Button variant="primary" size="md" className="h-11 self-start px-4 md:self-auto" onClick={search} aria-disabled={searching}>
          {searching ? "Searching…" : "Find jobs now"}
        </Button>
      </header>

      <p role="status" aria-live="polite" className="text-soft min-h-5">
        {status}
      </p>
      <p role="alert" className="text-danger empty:hidden">
        {alert}
      </p>
      {loadError && <p className="text-danger">Your jobs could not be loaded. Refresh the page to try again.</p>}

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="jobs-search" className="caption-style text-soft">
            Search by role, company or skill
          </label>
          <input id="jobs-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} className={`${CONTROL} w-full`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="jobs-fit" className="caption-style text-soft">
            Fit
          </label>
          <select id="jobs-fit" value={fit} onChange={(e) => setFit(e.target.value)} className={CONTROL}>
            <option value="">All fits</option>
            <option value="good">Strong and good</option>
            <option value="strong">Strong only</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="jobs-where" className="caption-style text-soft">
            Where
          </label>
          <select id="jobs-where" value={where} onChange={(e) => setWhere(e.target.value)} className={CONTROL}>
            {WHERE_FILTERS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <label className="text-foreground flex min-h-11 items-center gap-2 text-[14px]">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-primary size-5" />
            Show hidden jobs ({hiddenCount})
          </label>
          <label className="text-foreground flex min-h-11 items-center gap-2 text-[14px]">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="accent-primary size-5" />
            Show &ldquo;Not for me&rdquo;
          </label>
          <label className="text-foreground flex min-h-11 items-center gap-2 text-[14px]">
            <input type="checkbox" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} className="accent-primary size-5" />
            Only jobs you can apply to by email ({jobs.filter((j) => j.apply_email && !j.hidden_reason).length})
          </label>
        </div>
      </div>

      <Tabs defaultValue="table" className="gap-4">
        <div className="border-line-strong flex items-center justify-between gap-4 border-b">
          <TabsList aria-label="Job views">
            <TabsTrigger value="table" className="text-soft min-h-11 py-3">
              Table
            </TabsTrigger>
            <TabsTrigger value="board" className="text-soft min-h-11 py-3">
              Board
            </TabsTrigger>
          </TabsList>
          <h2 className="caption-style text-soft font-normal" aria-live="polite">
            {shown.length} job{shown.length === 1 ? "" : "s"}
          </h2>
        </div>

        <TabsContent value="table">
          {shown.length === 0 ? (
            <Empty searched={Boolean(lastRun)} />
          ) : (
            <div className="border-line-strong overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[46em] border-collapse text-left text-[14px]">
                <caption className="sr-only">Jobs that fit your profile, best fit first. Select a role to see details.</caption>
                <thead className="text-soft caption-style">
                  <tr className="border-line-strong border-b">
                    <th scope="col" className="w-24 px-4 py-3 font-normal">Fit</th>
                    <th scope="col" className="px-4 py-3 font-normal">Role</th>
                    <th scope="col" className="px-4 py-3 font-normal">Where</th>
                    <th scope="col" className="px-4 py-3 font-normal">Pay</th>
                    <th scope="col" className="px-4 py-3 font-normal">Posted</th>
                    <th scope="col" className="px-4 py-3 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((j) => (
                    <tr key={j.id} className="border-line-strong hover:bg-white/3 border-b last:border-b-0">
                      <td className="px-4 py-3 align-top">
                        <FitTag job={j} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => setOpenId(j.id)}
                          className="focus-visible:ring-ring -mx-1 -my-0.5 rounded-md px-1 py-0.5 text-left font-medium outline-none hover:underline focus-visible:ring-2"
                        >
                          {j.title}
                        </button>
                        <div className="text-soft caption-style mt-1">
                          {j.company || "Company not named"} · via {sources[j.source]?.name ?? j.source}
                          {j.apply_email && <> · <span className="text-foreground">Apply by email</span></>}
                        </div>
                        {j.hidden_reason && <div className="caption-style mt-1 text-(--tag-amber-text)">Hidden: {j.hidden_reason}</div>}
                      </td>
                      <td className="px-4 py-3 align-top">{WHERE_LABEL[j.eligibility]}</td>
                      <td className="px-4 py-3 align-top tabular-nums">{payText(j.pay_monthly_usd)}</td>
                      <td className="px-4 py-3 align-top">{ago(j.posted_at)}</td>
                      <td className="px-4 py-3 align-top">{STATUS_LABEL[j.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="board">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BOARD.map((col) => {
              const items = shown.filter((j) => j.status === col);
              return (
                <section key={col} aria-labelledby={`col-${col}`} className="bg-card/40 border-line-strong flex min-w-0 flex-col gap-3 rounded-xl border p-3">
                  <h3 id={`col-${col}`} className="flex items-center justify-between px-1 py-1 font-medium">
                    {STATUS_LABEL[col]}
                    <span className="text-soft caption-style font-normal">{items.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {items.slice(0, 60).map((j) => (
                      <li key={j.id}>
                        <button
                          type="button"
                          onClick={() => setOpenId(j.id)}
                          className="bg-secondary border-line-strong hover:border-ring focus-visible:ring-ring flex w-full flex-col gap-2 rounded-lg border p-3 text-left outline-none transition-[border-color,transform] duration-150 ease-power3-out focus-visible:ring-2 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
                        >
                          <span className="font-medium leading-snug">{j.title}</span>
                          <span className="text-soft caption-style">{j.company || "Company not named"}</span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <FitTag job={j} />
                            <Tag tone="neutral" size="sm">
                              {WHERE_LABEL[j.eligibility]}
                            </Tag>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {items.length > 60 && <p className="caption-style text-soft px-1">Showing the top 60. Use the table to see all {items.length}.</p>}
                  {items.length === 0 && <p className="caption-style text-soft px-1">Nothing here yet.</p>}
                </section>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <JobPeek job={open} sources={sources} onClose={() => setOpenId(null)} onMove={move} onCompany={companyFound} onError={setAlert} />
    </>
  );
}

function FitTag({ job }: { job: JobItem }) {
  const b = BAND[job.band];
  return (
    <Tag tone={b.tone} size="sm">
      {job.score} {b.label}
    </Tag>
  );
}

function Empty({ searched }: { searched: boolean }) {
  return (
    <div className="border-line-strong flex flex-col items-start gap-2 rounded-xl border border-dashed p-6">
      <p className="font-medium">{searched ? "No jobs match these filters." : "No jobs yet."}</p>
      <p className="text-soft leading-normal">
        {searched ? "Clear the search or pick “All fits” to see more." : "Press “Find jobs now”. The first search takes about 15 seconds."}
      </p>
    </div>
  );
}
