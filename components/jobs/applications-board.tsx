"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardCode,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
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
    col: "bg-[rgba(90,90,90,0.07)]",
  },
  blue: {
    pill: "bg-[rgb(40,69,108)]",
    dot: "bg-[rgb(55,154,211)]",
    col: "bg-[rgba(40,69,108,0.1)]",
  },
  purple: {
    pill: "bg-[rgb(73,47,100)]",
    dot: "bg-[rgb(157,104,211)]",
    col: "bg-[rgba(73,47,100,0.1)]",
  },
  orange: {
    pill: "bg-[rgb(133,76,29)]",
    dot: "bg-[rgb(199,125,72)]",
    col: "bg-[rgba(133,76,29,0.09)]",
  },
  green: {
    pill: "bg-[rgb(43,89,63)]",
    dot: "bg-[rgb(82,158,114)]",
    col: "bg-[rgba(43,89,63,0.1)]",
  },
  brown: {
    pill: "bg-[rgb(96,59,44)]",
    dot: "bg-[rgb(186,133,111)]",
    col: "bg-[rgba(96,59,44,0.09)]",
  },
  red: {
    pill: "bg-[rgb(110,54,48)]",
    dot: "bg-[rgb(223,84,82)]",
    col: "bg-[rgba(110,54,48,0.09)]",
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
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-[3px] px-1.5 text-[13px] leading-none whitespace-nowrap text-[#ebebeb]", t.pill)}>
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

// Arrow keys jump a picked-up card one column left or right; up and down are not needed.
const columnKeys: KeyboardCoordinateGetter = (event, { context }) => {
  const order = COLUMNS.map((c) => c.status as string);
  const here = String(context.over?.id ?? context.active?.data.current?.status ?? "");
  const step = event.code === KeyboardCode.Right ? 1 : event.code === KeyboardCode.Left ? -1 : 0;
  if (!step) return undefined;
  event.preventDefault();
  const next = order[Math.min(order.length - 1, Math.max(0, order.indexOf(here) + step))];
  const rect = context.droppableRects.get(next);
  return rect ? { x: rect.left + 8, y: rect.top + 44 } : undefined;
};

// The pointer decides when it is over a column; keyboard drags fall back to overlap.
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

const CHIP = "inline-flex h-[22px] items-center rounded-[4px] bg-white/[0.07] px-1.5 text-[12px] leading-none text-[#d4d4d4] whitespace-nowrap";

export default function ApplicationsBoard({ initial, sources, waiting = 0 }: { initial: AppItem[]; sources: SourceNames; waiting?: number }) {
  const [changes, setChanges] = useState<Record<string, Partial<AppItem>>>({});
  const [view, setView] = useState<"board" | "table">("board");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // A short press-and-move drags; a tap or click still opens the card. Touch waits a moment so the page can scroll.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeys }),
  );
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

  async function move(id: string, next: Status, quiet = false) {
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
    // A drag is already announced by the drag library; say it once.
    if (!quiet) setSay(`${job.title} moved to ${STATUS_LABEL[next]}.`);
  }

  // Reduced motion: the card lands without the glide.
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setCalm(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);
  const titleOf = (id: string | number) => jobs.find((j) => j.id === id)?.title ?? "Card";
  const colName = (id: string | number | undefined) => (id ? STATUS_LABEL[id as Status] : "no column");
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}. Press the left and right arrows to change column, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) => `${titleOf(active.id)} is over ${colName(over?.id)}.`,
    onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} dropped in ${colName(over.id)}.` : `${titleOf(active.id)} put back.`),
    onDragCancel: ({ active }) => `Move cancelled. ${titleOf(active.id)} stays where it was.`,
  };

  function dropped(e: DragEndEvent) {
    setDragId(null);
    if (e.over) move(String(e.active.id), e.over.id as Status, true);
  }

  // Notion-style tabs: arrow keys move between Board and Table.
  function tabKeys(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? "board" : e.key === "End" ? "table" : view === "board" ? "table" : "board";
    setView(next);
    requestAnimationFrame(() => document.getElementById(`apps-tab-${next}`)?.focus());
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
              id={`apps-tab-${v}`}
              tabIndex={view === v ? 0 : -1}
              onKeyDown={tabKeys}
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
          {/* Emails waiting to send and follow-ups: part of the same story, so they live here. */}
          <a
            href="/outbox"
            className="text-soft hover:text-foreground focus-visible:ring-ring inline-flex min-h-9 items-center rounded-md px-2 text-[14px] whitespace-nowrap underline-offset-2 outline-none hover:underline focus-visible:ring-2"
          >
            Outbox{waiting ? ` · ${waiting} waiting` : ""}
          </a>
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
          <span className="text-soft text-[14px] whitespace-nowrap tabular-nums" aria-live="polite">
            {shown.length} shown
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
          <DndContext
            // A fixed id keeps dnd-kit's screen-reader ids the same on the server and in the browser.
            id="applications-board"
            sensors={sensors}
            collisionDetection={collide}
            accessibility={{
              announcements,
              screenReaderInstructions: { draggable: "To move this card, press Space. Then use the left and right arrows to pick a column, and Space again to drop it." },
            }}
            onDragStart={(e) => setDragId(String(e.active.id))}
            onDragEnd={dropped}
            onDragCancel={() => setDragId(null)}
          >
            <Columns>
              {COLUMNS.map((col) => (
                <Column key={col.status} col={col} items={shown.filter((j) => j.status === col.status)}>
                  {(j) => <Card job={j} sources={sources} onOpen={() => setOpenId(j.id)} />}
                </Column>
              ))}
            </Columns>
            <DragOverlay dropAnimation={calm ? null : { duration: 180, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" }}>
              {dragId ? <CardFace job={jobs.find((j) => j.id === dragId)!} sources={sources} lifted /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <Table jobs={shown} onOpen={setOpenId} />
        )}
      </div>

      <JobPeek job={open} sources={sources} onClose={() => setOpenId(null)} onMove={move} onApplied={applied} onCompany={companyFound} onError={setAlert} />
    </>
  );
}

// The board scrolls sideways. A fade on an edge shows there are more columns that way;
// on a phone each column snaps into place.
function Columns({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, []);
  const mask =
    edges.left && edges.right
      ? "[mask-image:linear-gradient(to_right,transparent,black_40px,black_calc(100%-56px),transparent)]"
      : edges.right
        ? "[mask-image:linear-gradient(to_right,black_calc(100%-56px),transparent)]"
        : edges.left
          ? "[mask-image:linear-gradient(to_right,transparent,black_40px)]"
          : "";
  return (
    <div ref={ref} className={cn("-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto scroll-smooth px-4 pb-4 motion-reduce:scroll-auto md:-mx-8 md:snap-none md:px-8", mask)}>
      <div className="flex w-max gap-2.5">{children}</div>
    </div>
  );
}

function Column({ col, items, children }: { col: (typeof COLUMNS)[number]; items: AppItem[]; children: (j: AppItem) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status });
  const t = TONE[col.tone];
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`apps-col-${col.status}`}
      className={cn(
        "flex w-[min(16.5rem,82vw)] shrink-0 snap-start flex-col gap-1.5 rounded-md p-1.5 transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none",
        t.col,
        isOver && "bg-white/[0.06] ring-2 ring-[rgb(55,154,211)]",
      )}
    >
      <h2 id={`apps-col-${col.status}`} className="flex h-8 items-center gap-2 px-1">
        <StatusPill status={col.status} />
        <span className="text-soft text-[14px] tabular-nums">
          {items.length}
          <span className="sr-only"> {items.length === 1 ? "application" : "applications"}</span>
        </span>
      </h2>
      <ul className="flex min-h-12 flex-col gap-1.5">
        {items.map((j) => (
          <li key={j.id}>{children(j)}</li>
        ))}
      </ul>
      {items.length === 0 && <p className="text-soft px-1 pb-1 text-[13px] leading-normal">{col.empty}</p>}
    </section>
  );
}

// Click or tap the card to open it. Press-and-move drags it; the grip button drags it by keyboard.
function Card({ job, sources, onOpen }: { job: AppItem; sources: SourceNames; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: job.id, data: { status: job.status } });
  // The grip is a real <button>, so dnd-kit's role="button" is left off.
  const dragAttributes = { ...attributes, role: undefined };
  // Pointer and touch start a drag from anywhere on the card; the keyboard only from the grip.
  const on = listeners as Record<"onPointerDown" | "onTouchStart" | "onKeyDown", (e: unknown) => void> | undefined;
  return (
    <div ref={setNodeRef} className={cn("group relative", isDragging && "opacity-40")} onPointerDown={on?.onPointerDown} onTouchStart={on?.onTouchStart}>
      <button type="button" onClick={onOpen} className="focus-visible:ring-ring block w-full rounded-md text-left outline-none focus-visible:ring-2">
        <CardFace job={job} sources={sources} />
      </button>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...dragAttributes}
        onKeyDown={on?.onKeyDown}
        aria-label={`Move ${job.title}`}
        className="text-soft hover:text-foreground focus-visible:ring-ring absolute top-1 right-1 grid size-8 cursor-grab touch-none place-items-center rounded-md bg-[rgb(37,37,37)] opacity-100 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 active:cursor-grabbing md:opacity-0"
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 10 16" className="size-3.5 fill-current">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="8" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" />
          <circle cx="8" cy="14" r="1.5" />
        </svg>
      </button>
    </div>
  );
}

function CardFace({ job, sources, lifted = false }: { job: AppItem; sources: SourceNames; lifted?: boolean }) {
  const proof = proofLine(job);
  return (
    <span
      className={cn(
        "flex w-full min-w-0 flex-col gap-1.5 rounded-md bg-[rgb(37,37,37)] p-2.5 pr-10 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.3)] hover:bg-[rgb(44,44,44)]",
        lifted && "w-[min(16.5rem,82vw)] rotate-[1.5deg] cursor-grabbing bg-[rgb(48,48,48)] shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_12px_32px_rgba(0,0,0,0.55)] motion-reduce:rotate-0",
      )}
    >
      <span className="line-clamp-3 text-[14px] leading-snug font-medium break-words">{job.title}</span>
      <span className="text-soft line-clamp-1 text-[13px] break-all">
        {job.company || "Company not named"}
        <span className="sr-only">. Via {sources[job.source]?.name ?? job.source}</span>
      </span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {proof && (
          <span className={cn(CHIP, "max-w-full truncate", proof.strong && "bg-[rgba(43,89,63,0.55)] text-[#d7f0e0]")}>
            <span aria-hidden className="mr-1">
              {proof.strong ? "✓" : "•"}
            </span>
            {proof.text}
          </span>
        )}
        {job.applied_at && <span className={CHIP}>Applied {ago(job.applied_at).toLowerCase()}</span>}
        {!job.applied_at && job.posted_at && <span className={CHIP}>Posted {ago(job.posted_at).toLowerCase()}</span>}
      </span>
      {job.latest && !/^(sent_email|submitted_form|marked_applied)$/.test(job.latest.kind) && <span className="text-soft line-clamp-2 text-[12px] leading-snug break-words">{job.latest.title}</span>}
    </span>
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
