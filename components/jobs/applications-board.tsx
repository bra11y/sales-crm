"use client";

import { useMemo, useState } from "react";
import { setJobStatus } from "@/app/(crm)/jobs/actions";
import type { CompanyInfo } from "@/lib/jobs/company";
import { cn } from "@/lib/utils";
import JobPeek from "./job-peek";
import type { JobItem, SourceNames } from "./jobs-board";
import { ago, type Status, STATUS_LABEL } from "./labels";

export type Latest = { kind: string; title: string; at: string };
export type AppItem = JobItem & {
  applied_at: string | null;
  applied_via: "email" | "form" | "manual" | null;
  confirmed_at: string | null;
  latest: Latest | null;
};

// Notion's dark-mode select colours. Pill text #ebebeb passes 4.5:1 on every one.
const TONE = {
  gray: {
    pill: "bg-[rgb(90,90,90)]",
    dot: "bg-[rgb(155,155,155)]",
    col: "bg-[rgba(90,90,90,0.12)]",
  },
  blue: {
    pill: "bg-[rgb(40,69,108)]",
    dot: "bg-[rgb(55,154,211)]",
    col: "bg-[rgba(40,69,108,0.18)]",
  },
  purple: {
    pill: "bg-[rgb(73,47,100)]",
    dot: "bg-[rgb(157,104,211)]",
    col: "bg-[rgba(73,47,100,0.18)]",
  },
  orange: {
    pill: "bg-[rgb(133,76,29)]",
    dot: "bg-[rgb(199,125,72)]",
    col: "bg-[rgba(133,76,29,0.16)]",
  },
  green: {
    pill: "bg-[rgb(43,89,63)]",
    dot: "bg-[rgb(82,158,114)]",
    col: "bg-[rgba(43,89,63,0.18)]",
  },
  brown: {
    pill: "bg-[rgb(96,59,44)]",
    dot: "bg-[rgb(186,133,111)]",
    col: "bg-[rgba(96,59,44,0.16)]",
  },
  red: {
    pill: "bg-[rgb(110,54,48)]",
    dot: "bg-[rgb(223,84,82)]",
    col: "bg-[rgba(110,54,48,0.16)]",
  },
} as const;
type Tone = keyof typeof TONE;

export const COLUMNS: { status: Status; tone: Tone; empty: string }[] = [
  {
    status: "saved",
    tone: "gray",
    empty: "Save a job from Jobs to plan it here.",
  },
  {
    status: "applied",
    tone: "blue",
    empty: "Applications you send land here by themselves.",
  },
  {
    status: "replied",
    tone: "purple",
    empty: "Replies in your Gmail move jobs here.",
  },
  {
    status: "interview",
    tone: "orange",
    empty: "Interview invites move jobs here.",
  },
  { status: "offer", tone: "green", empty: "Offers land here." },
  {
    status: "no_reply",
    tone: "brown",
    empty: "Silent for 3 weeks? It moves here.",
  },
  {
    status: "rejected",
    tone: "red",
    empty: "A no moves the job here, so you can learn from it.",
  },
];
const TONE_OF = Object.fromEntries(COLUMNS.map((c) => [c.status, c.tone])) as Record<string, Tone>;

export function StatusPill({ status }: { status: Status }) {
  const t = TONE[TONE_OF[status] ?? "gray"];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[13px] leading-none whitespace-nowrap text-[#ebebeb]", t.pill)}>
      <span aria-hidden className={cn("size-2 rounded-full", t.dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}

// The one line that answers "did it really go out?".
export function proofLine(j: AppItem): { text: string; strong: boolean } | null {
  if (j.confirmed_at) return { text: `Confirmed by ${j.company || "the company"}`, strong: true };
  if (j.applied_via === "email") return { text: "Sent from your Gmail", strong: true };
  if (j.applied_via === "form") return { text: "Submitted on their form", strong: true };
  if (j.applied_via === "manual") return { text: "Marked by you, no receipt yet", strong: false };
  if (j.status !== "saved") return { text: "No proof recorded", strong: false };
  return null;
}

const CHIP = "inline-flex h-[22px] items-center rounded-[4px] bg-white/[0.07] px-1.5 text-[12px] leading-none text-[#d4d4d4] whitespace-nowrap";

export default function ApplicationsBoard({ initial, sources }: { initial: AppItem[]; sources: SourceNames }) {
  const [changes, setChanges] = useState<Record<string, Partial<AppItem>>>({});
  const [view, setView] = useState<"board" | "table">("board");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [say, setSay] = useState("");
  const [alert, setAlert] = useState("");
  const [now] = useState(() => Date.now());

  const jobs = useMemo(() => initial.map((j) => ({ ...j, ...changes[j.id] })), [initial, changes]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? jobs.filter((j) => `${j.title} ${j.company}`.toLowerCase().includes(q)) : jobs;
  }, [jobs, query]);
  const open = jobs.find((j) => j.id === openId) ?? null;

  const count = (s: Status[]) => jobs.filter((j) => s.includes(j.status)).length;
  const week = jobs.filter((j) => j.applied_at && now - Date.parse(j.applied_at) < 7 * 86_400_000).length;

  async function move(id: string, next: Status) {
    const job = jobs.find((j) => j.id === id);
    if (!job || job.status === next) return;
    const before = job.status;
    setChanges((c) => ({
      ...c,
      [id]: {
        ...c[id],
        status: next,
        ...(next === "applied" && !job.applied_at
          ? {
              applied_at: new Date().toISOString(),
              applied_via: "manual" as const,
            }
          : {}),
      },
    }));
    const r = await setJobStatus(id, next);
    if (!r.ok) {
      setChanges((c) => ({ ...c, [id]: { ...c[id], status: before } }));
      setAlert(r.error);
      return;
    }
    setAlert("");
    setSay(`${job.title} moved to ${STATUS_LABEL[next]}.`);
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
      <header className="flex flex-col gap-2 px-1">
        <h1 className="text-[32px] leading-[1.2] font-bold tracking-[-0.01em]">Applications</h1>
        <p className="text-soft max-w-[48em] text-[14px] leading-normal">
          Every job you applied to, with proof it went out. Jobs move by themselves: sending moves them to Applied, and replies in your Gmail move them to Replied, Interview, Offer or Not selected.
          Drag a card, or open it, to move it yourself.
        </p>
        <p className="text-soft text-[14px] tabular-nums">
          {week} sent this week · {count(["applied"])} waiting for a reply · {count(["replied", "interview"])} talking · {count(["offer"])} {count(["offer"]) === 1 ? "offer" : "offers"}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.09]">
        <div role="tablist" aria-label="Views" className="flex">
          {(["board", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              aria-controls="apps-view"
              onClick={() => setView(v)}
              className={cn(
                "focus-visible:ring-ring -mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-inset",
                view === v ? "border-foreground text-foreground font-medium" : "text-soft hover:text-foreground border-transparent",
              )}
            >
              <span aria-hidden>{v === "board" ? "▦" : "☰"}</span>
              {v === "board" ? "Board" : "Table"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <label htmlFor="apps-search" className="sr-only">
            Search applications
          </label>
          <input
            id="apps-search"
            type="search"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="focus-visible:ring-ring h-9 w-44 rounded-md border border-[#6b6b6b] bg-white/[0.04] px-2.5 text-[14px] outline-none placeholder:text-[#9b9b9b] focus-visible:ring-2"
          />
          <span className="text-soft text-[14px] tabular-nums" aria-live="polite">
            {shown.length}
          </span>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {say}
      </p>
      {alert && (
        <p role="alert" className="text-danger">
          {alert}
        </p>
      )}

      <div id="apps-view" role="tabpanel" aria-label={view === "board" ? "Board" : "Table"}>
        {view === "board" ? (
          <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
            <div className="flex w-max gap-3">
              {COLUMNS.map((col) => {
                const items = shown.filter((j) => j.status === col.status);
                const t = TONE[col.tone];
                return (
                  <section
                    key={col.status}
                    aria-labelledby={`apps-col-${col.status}`}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      setOver(col.status);
                    }}
                    onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) move(dragId, col.status);
                      setDragId(null);
                      setOver(null);
                    }}
                    className={cn(
                      "flex w-[17rem] shrink-0 flex-col gap-2 rounded-lg p-2 transition-[box-shadow] duration-150 motion-reduce:transition-none",
                      t.col,
                      over === col.status && "ring-2 ring-[rgb(55,154,211)]",
                    )}
                  >
                    <h2 id={`apps-col-${col.status}`} className="flex h-8 items-center gap-2 px-1">
                      <StatusPill status={col.status} />
                      <span className="text-soft text-[14px] tabular-nums">
                        {items.length}
                        <span className="sr-only"> {items.length === 1 ? "application" : "applications"}</span>
                      </span>
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {items.map((j) => (
                        <li key={j.id}>
                          <Card job={j} sources={sources} onOpen={() => setOpenId(j.id)} onDrag={(on) => setDragId(on ? j.id : null)} dragging={dragId === j.id} />
                        </li>
                      ))}
                    </ul>
                    {items.length === 0 && <p className="text-soft px-1 pb-1 text-[13px] leading-normal">{col.empty}</p>}
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
          <Table jobs={shown} onOpen={setOpenId} />
        )}
      </div>

      <JobPeek job={open} sources={sources} onClose={() => setOpenId(null)} onMove={move} onApplied={applied} onCompany={companyFound} onError={setAlert} />
    </>
  );
}

function Card({ job, sources, onOpen, onDrag, dragging }: { job: AppItem; sources: SourceNames; onOpen: () => void; onDrag: (on: boolean) => void; dragging: boolean }) {
  const proof = proofLine(job);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDrag(true);
      }}
      onDragEnd={() => onDrag(false)}
      onClick={onOpen}
      className={cn(
        "focus-visible:ring-ring flex w-full flex-col gap-1.5 rounded-md bg-[rgb(37,37,37)] p-2.5 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.35)] outline-none hover:bg-[rgb(44,44,44)] focus-visible:ring-2",
        dragging && "opacity-50",
      )}
    >
      <span className="text-[14px] leading-snug font-medium">{job.title}</span>
      <span className="text-soft text-[13px]">
        {job.company || "Company not named"}
        <span className="sr-only">. Via {sources[job.source]?.name ?? job.source}</span>
      </span>
      <span className="flex flex-wrap gap-1">
        {proof && (
          <span className={cn(CHIP, proof.strong && "bg-[rgba(43,89,63,0.55)] text-[#d7f0e0]")}>
            <span aria-hidden className="mr-1">
              {proof.strong ? "✓" : "•"}
            </span>
            {proof.text}
          </span>
        )}
        {job.applied_at && <span className={CHIP}>Applied {ago(job.applied_at).toLowerCase()}</span>}
        {!job.applied_at && job.posted_at && <span className={CHIP}>Posted {ago(job.posted_at).toLowerCase()}</span>}
      </span>
      {job.latest && !/^(sent_email|submitted_form|marked_applied)$/.test(job.latest.kind) && <span className="text-soft line-clamp-2 text-[12px] leading-snug">{job.latest.title}</span>}
    </button>
  );
}

function Table({ jobs, onOpen }: { jobs: AppItem[]; onOpen: (id: string) => void }) {
  if (!jobs.length) return <p className="text-soft py-6">No applications yet. Press Apply on a job in Jobs and it shows here.</p>;
  const TH = "h-9 px-2 text-left text-[13px] font-normal text-soft border-b border-r border-white/[0.09] last:border-r-0";
  const TD = "px-2 py-2 align-top border-b border-r border-white/[0.09] last:border-r-0";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56em] border-collapse text-[14px]">
        <caption className="sr-only">Your applications. Select a role to see its history and proof.</caption>
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Role
            </th>
            <th scope="col" className={TH}>
              Company
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={TH}>
              Applied
            </th>
            <th scope="col" className={TH}>
              Proof
            </th>
            <th scope="col" className={TH}>
              Latest
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const proof = proofLine(j);
            return (
              <tr key={j.id} className="hover:bg-white/[0.03]">
                <td className={TD}>
                  <button
                    type="button"
                    onClick={() => onOpen(j.id)}
                    className="focus-visible:ring-ring rounded text-left font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                  >
                    {j.title}
                  </button>
                </td>
                <td className={TD}>{j.company || "Not named"}</td>
                <td className={TD}>
                  <StatusPill status={j.status} />
                </td>
                <td className={cn(TD, "whitespace-nowrap tabular-nums")}>
                  {j.applied_at
                    ? new Date(j.applied_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })
                    : "Not yet"}
                </td>
                <td className={TD}>{proof ? proof.text : "None yet"}</td>
                <td className={cn(TD, "text-soft")}>{j.latest ? `${j.latest.title} · ${ago(j.latest.at).toLowerCase()}` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
