"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import { draftGigReply, setGigStatus } from "@/app/(crm)/freelance/actions";
import { GIG_SOURCE, type Gig } from "@/lib/gigs/feeds";
import { cn } from "@/lib/utils";

export type GigItem = Gig & { matched: string[]; fits: boolean; status: string | null };

const STAGE: Record<string, string> = { drafted: "Reply drafted", sent: "Reply sent", replied: "They replied", won: "Won the work", not_for_me: "Not for me" };
const when = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
};

export default function GigList({ gigs, failed }: { gigs: GigItem[]; failed: string[] }) {
  const id = useId();
  const [mine, setMine] = useState(true);
  const [emailOnly, setEmailOnly] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [stages, setStages] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<{ id: string; text: string; url?: string } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const stageOf = (g: GigItem) => stages[g.id] ?? g.status;
  const shown = useMemo(
    () => gigs.filter((g) => (!mine || g.fits) && (!emailOnly || g.email) && (showDone || stageOf(g) !== "not_for_me")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gigs, mine, emailOnly, showDone, stages],
  );

  function reply(g: GigItem) {
    if (pending) return;
    start(async () => {
      setError("");
      setStatus("Writing your reply…");
      const r = await draftGigReply(g.id);
      if (!r.ok) {
        setStatus("");
        setError(r.error);
        return;
      }
      setStatus(r.note ?? "Reply ready.");
      setStages((s) => ({ ...s, [g.id]: "drafted" }));
      setDraft(r.text ? { id: g.id, text: r.text, url: r.url } : null);
    });
  }

  function mark(g: GigItem, next: string) {
    start(async () => {
      const r = await setGigStatus({ id: g.id, url: g.url, title: g.title }, next);
      if (!r.ok) return setError(r.error);
      setStages((s) => ({ ...s, [g.id]: next }));
      setStatus(next === "not_for_me" ? "Hidden. Tick “Show ones I passed on” to see it again." : `Marked: ${STAGE[next]}.`);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-soft max-w-[48em] leading-normal">
        Posts from people who need work done: contract, freelance and part-time posts in Hacker News&rsquo;s monthly hiring threads, and #hiring posts on Mastodon. You answer the person who posted, so
        there is no job site to sign up to. Replies go to your Gmail Drafts; nothing is sent for you.
      </p>
      {failed.length > 0 && <p className="text-[14px] text-(--tag-amber-text)">Did not answer this time: {failed.join(", ")}. The page tries again within an hour.</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-primary size-5" />
          Only posts that fit my skills and level
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          <input type="checkbox" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} className="accent-primary size-5" />
          Only posts with an email address
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-primary size-5" />
          Show ones I passed on
        </label>
      </div>
      <p role="status" aria-live="polite" className="text-soft min-h-5">
        {status}
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <h2 className="caption-style text-soft font-normal" aria-live="polite">
        {shown.length} post{shown.length === 1 ? "" : "s"}
      </h2>
      {shown.length === 0 ? (
        <p className="text-soft rounded-2xl bg-white/[0.04] p-5 leading-normal">
          {mine ? "No posts fit your skills and level right now. Untick “Only posts that fit my skills and level” to see them all." : "No posts right now. New ones come in through the month."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((g) => {
            const stage = stageOf(g);
            return (
              <li key={g.id} className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4">
                <div className="flex flex-col gap-1">
                  <h3 className="font-medium break-words">{g.title}</h3>
                  <p className="text-soft text-[14px]">
                    {g.author} on {GIG_SOURCE[g.source]} · {when(g.postedAt)} · <span className="capitalize">{g.kind.replace(/-/g, " ")}</span>
                    {g.email ? " · Has an email" : " · Reply on the post"}
                    {stage ? ` · ${STAGE[stage]}` : ""}
                  </p>
                  {g.matched.length > 0 && <p className="text-[14px]">Asks for: {g.matched.slice(0, 6).join(", ")}</p>}
                </div>
                <details className="text-[14px]">
                  <summary className="focus-visible:ring-ring min-h-6 cursor-pointer rounded outline-none focus-visible:ring-2">Read the post</summary>
                  <p className="text-soft mt-2 leading-relaxed break-words whitespace-pre-line">{g.text}</p>
                </details>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="primary" size="md" className="h-11 rounded-xl px-4" aria-disabled={pending} onClick={() => reply(g)}>
                    {g.email ? "Draft a reply in Gmail" : "Write my reply"}
                    <span className="sr-only"> to {g.title}</span>
                  </Button>
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-secondary focus-visible:ring-ring border-line-strong inline-flex h-11 items-center rounded-xl border px-4 text-[15px] outline-none focus-visible:ring-2"
                  >
                    Open the post<span className="sr-only"> {g.title} (opens in a new tab)</span>
                  </a>
                  <label className="sr-only" htmlFor={`${id}-${g.id}`}>
                    Stage for {g.title}
                  </label>
                  <select
                    id={`${id}-${g.id}`}
                    value={stage ?? ""}
                    onChange={(e) => e.target.value && mark(g, e.target.value)}
                    className="border-line-strong bg-secondary focus-visible:ring-ring h-11 cursor-pointer rounded-xl border px-3 text-[14px] outline-none focus-visible:ring-2"
                  >
                    <option value="">Stage…</option>
                    {Object.entries(STAGE).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                {draft?.id === g.id && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor={`${id}-${g.id}-text`} className="text-[14px] font-medium">
                      Your reply (edit it, then copy)
                    </label>
                    <textarea
                      id={`${id}-${g.id}-text`}
                      defaultValue={draft.text}
                      rows={12}
                      className={cn("border-line-strong bg-secondary focus-visible:ring-ring w-full rounded-xl border p-3 text-[14px] leading-relaxed outline-none focus-visible:ring-2")}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
