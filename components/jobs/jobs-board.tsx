"use client";

import { needsAccount } from "@/lib/jobs/account";
import { jobLevel, LEVEL_LABEL, LEVELS } from "@/lib/jobs/level";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/_ui/tabs";
import { findJobsNow, setJobStatus } from "@/app/(crm)/jobs/actions";
import type { CompanyInfo } from "@/lib/jobs/company";
import { StatusPill } from "./applications-board";
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
export type LastRun = {
  started_at: string;
  finished_at: string | null;
  kept: number;
  added: number;
  errors: unknown[];
};
export type SourceNames = Record<string, { name: string; home: string }>;
// One row per job board for "Is the search working?": when it was last read and whether it answered.
export type BoardHealth = { id: string; name: string; checkedAt: string | null; error: string | null; jobs: number; stale: boolean };

const CONTROL =
  "h-11 rounded-lg border border-line-strong bg-secondary px-3 text-[14px] text-foreground outline-none transition-[border-color] duration-150 ease-power3-out focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";
const WHERE_FILTERS = [
  { value: "", label: "Anywhere I can work" },
  { value: "worldwide", label: "Worldwide only" },
  { value: "region", label: "Africa or EMEA" },
  { value: "local", label: "In my city" },
  { value: "nigeria", label: "In Nigeria (on-site too)" },
  { value: "visa", label: "Visa sponsorship" },
];
// Nigerian jobs, on-site included: the place they name, or the start of the post.
const NIGERIA =
  /\bnigeria|\blagos\b|\babuja\b|port harcourt|\bibadan\b|\bkano\b|\benugu\b|\bkaduna\b|\bbenin city\b|\bwarri\b|\babeokuta\b|\buyo\b|\bcalabar\b|\bowerri\b|\bjos\b|\bilorin\b|\bakure\b|\bonitsha\b|\baba\b|\bfct\b/i;
const inNigeria = (j: { location?: string | null; title: string; description?: string | null }) => NIGERIA.test(`${j.location ?? ""} ${j.title} ${(j.description ?? "").slice(0, 400)}`);

const BOARD: Status[] = ["new", "saved", "applied", "replied", "interview"];

export default function JobsBoard({
  initialJobs,
  lastRun,
  sources,
  loadError,
  openFirst = null,
  health = [],
}: {
  initialJobs: JobItem[];
  lastRun: LastRun | null;
  sources: SourceNames;
  loadError: boolean;
  openFirst?: string | null;
  health?: BoardHealth[];
}) {
  const [changes, setChanges] = useState<Record<string, Partial<JobItem>>>({});
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState("");
  const [where, setWhere] = useState("");
  const [level, setLevel] = useState("");
  // Jobs whose form makes you create an account first stay out of the way unless you ask.
  const [noAccount, setNoAccount] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [emailOnly, setEmailOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(openFirst);
  const [status, setStatusText] = useState("");
  const [alert, setAlert] = useState("");
  const [searching, startSearch] = useTransition();

  const jobs = useMemo(() => initialJobs.map((j) => ({ ...j, ...changes[j.id] })), [initialJobs, changes]);
  const hiddenCount = jobs.filter((j) => j.hidden_reason).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        // "In Nigeria" shows on-site and lower-paid Nigerian jobs too, each with its hidden reason.
        (showHidden || !j.hidden_reason || (where === "nigeria" && !/outside your fields|a site you skip/i.test(j.hidden_reason))) &&
        (showDismissed || j.status !== "dismissed") &&
        (!fit || (fit === "strong" ? j.band === "strong" : j.band !== "maybe")) &&
        (!where || (where === "nigeria" ? inNigeria(j) : j.eligibility === where)) &&
        (!level || jobLevel(j.title, j.description).level === level) &&
        (!emailOnly || Boolean(j.apply_email)) &&
        (!noAccount || Boolean(j.apply_email) || !needsAccount(j.apply_url)) &&
        (!q || `${j.title} ${j.company} ${j.matched.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [jobs, query, fit, where, level, showHidden, showDismissed, emailOnly, noAccount]);
  const accountCount = jobs.filter((j) => !j.apply_email && needsAccount(j.apply_url)).length;
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
      // Every board was asked a short time ago: say so, and when to try again.
      if (r.asked === 0)
        return say(
          `Nothing to check yet. Every job board was searched in the last hour${r.nextAt ? `. Try again after ${new Date(r.nextAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}. The jobs below are up to date.`,
        );
      say(
        `Done. ${r.added} new job${r.added === 1 ? "" : "s"}, ${r.kept} that fit you in total.` +
          (r.fromEmail ? ` Read ${r.fromEmail} job${r.fromEmail === 1 ? "" : "s"} from the job-alert emails in your Gmail.` : r.fromEmail === 0 ? " No new job-alert emails in your Gmail." : "") +
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

  function applied(id: string) {
    const now = jobs.find((j) => j.id === id)?.status;
    if (now === "new" || now === "saved" || now === "dismissed") setChanges((c) => ({ ...c, [id]: { ...c[id], status: "applied" } }));
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
            Jobs from remote job boards, Nigerian job sites, company career pages and the job-alert emails in your Gmail, scored against your profile. Jobs under your pay floor, closed to where you
            live, or not at the level you want are hidden, and the reason is shown.
          </p>
          <p className="caption-style text-soft">
            {lastRun
              ? `Last search ${ago(lastRun.started_at).toLowerCase()}, ${new Date(lastRun.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. `
              : "No search yet. "}
            The app also searches by itself every day at 7:00 Abuja time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start md:self-auto">
          <Link href="/jobs/add" className="bg-secondary focus-visible:ring-ring border-line-strong inline-flex h-11 items-center rounded-lg border px-4 text-[15px] outline-none focus-visible:ring-2">
            Add from a screenshot
          </Link>
          <Button variant="primary" size="md" className="h-11 px-4" onClick={search} aria-disabled={searching}>
            {searching ? "Searching…" : "Find jobs now"}
          </Button>
        </div>
      </header>

      <p role="status" aria-live="polite" className="text-soft min-h-5">
        {status}
      </p>
      <p role="alert" className="text-danger empty:hidden">
        {alert}
      </p>
      {loadError && <p className="text-danger">Your jobs could not be loaded. Refresh the page to try again.</p>}
      {health.length > 0 && <Health boards={health} />}

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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="jobs-level" className="caption-style text-soft">
            Level
          </label>
          <select id="jobs-level" value={level} onChange={(e) => setLevel(e.target.value)} className={CONTROL}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
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
            <input type="checkbox" checked={noAccount} onChange={(e) => setNoAccount(e.target.checked)} className="accent-primary size-5" />
            No sign-up needed (hides {accountCount} that make you create an account)
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
                    <th scope="col" className="w-24 px-4 py-3 font-normal">
                      Fit
                    </th>
                    <th scope="col" className="px-4 py-3 font-normal">
                      Role
                    </th>
                    <th scope="col" className="px-4 py-3 font-normal">
                      Where
                    </th>
                    <th scope="col" className="px-4 py-3 font-normal">
                      Pay
                    </th>
                    <th scope="col" className="px-4 py-3 font-normal">
                      Posted
                    </th>
                    <th scope="col" className="px-4 py-3 font-normal">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((j) => (
                    <tr key={j.id} className="border-line-strong border-b last:border-b-0 hover:bg-white/3">
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
                          {j.apply_email && (
                            <>
                              {" "}
                              · <span className="text-foreground">Apply by email</span>
                            </>
                          )}
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
          <p className="text-soft mb-3 text-[14px]">
            Once you apply, follow each job on the{" "}
            <a href="/applications" className="text-foreground underline underline-offset-2">
              Applications board
            </a>
            , with proof it went out.
          </p>
          <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
            <div className="flex w-max gap-3">
              {BOARD.map((col) => {
                const items = shown.filter((j) => j.status === col);
                return (
                  <section key={col} aria-labelledby={`col-${col}`} className="flex w-[17rem] shrink-0 flex-col gap-2 rounded-lg bg-white/[0.03] p-2">
                    <h3 id={`col-${col}`} className="flex h-8 items-center gap-2 px-1">
                      <StatusPill status={col} />
                      <span className="text-soft text-[14px] tabular-nums">{items.length}</span>
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {items.slice(0, 60).map((j) => (
                        <li key={j.id}>
                          <button
                            type="button"
                            onClick={() => setOpenId(j.id)}
                            className="focus-visible:ring-ring flex w-full flex-col gap-1.5 rounded-md bg-[rgb(37,37,37)] p-2.5 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.35)] outline-none hover:bg-[rgb(44,44,44)] focus-visible:ring-2"
                          >
                            <span className="text-[14px] leading-snug font-medium">{j.title}</span>
                            <span className="text-soft text-[13px]">{j.company || "Company not named"}</span>
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
                    {items.length === 0 && <p className="text-soft px-1 pb-1 text-[13px]">Nothing here yet.</p>}
                  </section>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <JobPeek job={open} sources={sources} onClose={() => setOpenId(null)} onMove={move} onApplied={applied} onCompany={companyFound} onError={setAlert} />
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

function Health({ boards }: { boards: BoardHealth[] }) {
  const failed = boards.filter((b) => b.error);
  const stale = boards.filter((b) => !b.error && b.stale);
  const summary = failed.length
    ? `${failed.length} job board${failed.length === 1 ? "" : "s"} did not answer last time`
    : stale.length
      ? `${stale.length} job board${stale.length === 1 ? " has" : "s have"} not been read for over a day`
      : `All ${boards.length} job boards answered`;
  return (
    <details className="rounded-xl bg-white/[0.04] px-4 py-3 text-[14px]">
      <summary className="focus-visible:ring-ring min-h-6 cursor-pointer rounded outline-none focus-visible:ring-2">
        Is the search working? <span className={failed.length || stale.length ? "text-(--tag-amber-text)" : "text-soft"}>{summary}.</span>
      </summary>
      <table className="mt-3 w-full text-left text-[13px]">
        <caption className="sr-only">Each job board, when it was last read, and the jobs it gave you</caption>
        <thead className="text-soft">
          <tr>
            <th scope="col" className="py-1 pr-3 font-normal">
              Board
            </th>
            <th scope="col" className="py-1 pr-3 font-normal">
              Last read
            </th>
            <th scope="col" className="py-1 pr-3 font-normal">
              State
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Jobs
            </th>
          </tr>
        </thead>
        <tbody>
          {boards.map((b) => (
            <tr key={b.id} className="border-t border-white/[0.06]">
              <th scope="row" className="py-1.5 pr-3 font-normal">
                {b.name}
              </th>
              <td className="py-1.5 pr-3">{b.checkedAt ? ago(b.checkedAt) : "Not yet"}</td>
              <td className={cn("py-1.5 pr-3", b.error && "text-danger")}>{b.error ? `Did not answer (${b.error})` : b.checkedAt ? "Working" : "Waiting for the next search"}</td>
              <td className="py-1.5 text-right tabular-nums">{b.jobs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Empty({ searched }: { searched: boolean }) {
  return (
    <div className="border-line-strong flex flex-col items-start gap-2 rounded-xl border border-dashed p-6">
      <p className="font-medium">{searched ? "No jobs match these filters." : "No jobs yet."}</p>
      <p className="text-soft leading-normal">{searched ? "Clear the search or pick “All fits” to see more." : "Press “Find jobs now”. The first search takes about 15 seconds."}</p>
    </div>
  );
}
