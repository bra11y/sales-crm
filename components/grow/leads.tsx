"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { dismissLead, trackLead } from "@/app/(crm)/grow-actions";
import { DOC_LABEL, type DocKind } from "@/lib/grow/documents";
import { dueText } from "@/lib/grow/grow";

export type Lead = {
  id: string;
  title: string;
  url: string;
  place: string | null;
  eligible: string | null;
  level: string | null;
  benefits: string[];
  needs: DocKind[];
  deadline: string | null;
  deadline_text: string | null;
};

const PAGE = 20;
const FIELD = "rounded-xl border border-line-strong bg-secondary px-3 h-11 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

export default function Leads({ leads, have, now }: { leads: Lead[]; have: DocKind[]; now: string }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return leads.filter((l) => (!t || `${l.title} ${l.place ?? ""}`.toLowerCase().includes(t)) && (!level || new RegExp(level, "i").test(`${l.level ?? ""} ${l.title}`)));
  }, [leads, q, level]);

  if (!leads.length) return null;
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h2 id={`${id}-h`} className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
        Found in your chats <span className="text-soft font-normal tabular-nums">{leads.length}</span>
      </h2>
      <p className="text-soft px-1 leading-normal">
        Still open and open to Nigerians, soonest deadline first. The links go to Scholarship Region&rsquo;s page, which links to the official one. Always apply on the official site.
      </p>
      <div className="flex flex-wrap items-end gap-2 px-1">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-q`} className="text-soft text-[13px]">
            Search
          </label>
          <input id={`${id}-q`} type="search" value={q} onChange={(e) => (setQ(e.target.value), setShown(PAGE))} placeholder="Country or school" className={`${FIELD} w-56`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-lv`} className="text-soft text-[13px]">
            Level
          </label>
          <select id={`${id}-lv`} value={level} onChange={(e) => (setLevel(e.target.value), setShown(PAGE))} className={`${FIELD} cursor-pointer pr-8`}>
            <option value="">Any level</option>
            <option value="undergrad|bachelor">Undergraduate</option>
            <option value="master|postgrad">Master&rsquo;s</option>
            <option value="phd|doctor">PhD</option>
            <option value="course|training|workshop|program">Short course or programme</option>
          </select>
        </div>
        <p aria-live="polite" className="text-soft pb-2.5 text-[14px] tabular-nums">
          {list.length} match
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {list.slice(0, shown).map((l) => (
          <LeadCard key={l.id} l={l} have={have} now={now} />
        ))}
      </ul>
      {shown < list.length && (
        <Button type="button" variant="secondary" size="md" className="h-11 self-start rounded-xl px-4" onClick={() => setShown((s) => s + PAGE)}>
          Show {Math.min(PAGE, list.length - shown)} more
        </Button>
      )}
    </section>
  );
}

function LeadCard({ l, have, now }: { l: Lead; have: DocKind[]; now: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const missing = l.needs.filter((k) => !have.includes(k));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? ok : (r.error ?? "Not saved."));
      if (r.ok) router.refresh();
    });
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-2xl bg-white/[0.04] p-4">
      <h3 className="leading-snug font-semibold break-words">
        <a href={l.url} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">
          {l.title}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </h3>
      <p className="text-soft text-[14px] break-words">{[l.place, l.level, l.eligible && `For: ${l.eligible}`].filter(Boolean).join(" · ")}</p>
      {l.benefits[0] && <p className="text-[14px] break-words">{l.benefits[0]}</p>}
      <p className="text-[13px] font-medium tabular-nums">{l.deadline ? dueText(l.deadline, new Date(now)) : l.deadline_text || "Deadline not given"}</p>
      {missing.length > 0 && (
        <p className="text-[13px] text-(--tag-amber-text)">
          Asks for documents you have not uploaded:{" "}
          {missing.map((k, i) => (
            <span key={k}>
              {i > 0 && ", "}
              <a href={`/documents?need=${k}`} className="underline underline-offset-2">
                {DOC_LABEL[k].toLowerCase()}
              </a>
            </span>
          ))}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="h-11 rounded-xl px-4"
          aria-disabled={pending}
          onClick={() => !pending && run(() => trackLead(l.id), "Added to your scholarships.")}
        >
          Track this<span className="sr-only">: {l.title}</span>
        </Button>
        <Button type="button" variant="ghost" size="md" className="text-soft h-11 px-3" aria-disabled={pending} onClick={() => !pending && run(() => dismissLead(l.id), "Hidden.")}>
          Not for me<span className="sr-only">: {l.title}</span>
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
        {msg}
      </p>
    </li>
  );
}
