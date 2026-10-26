"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { cancelEmail, checkRepliesNow, confirmReply, retryEmail, sendEmailNow } from "@/app/(crm)/outbox/actions";

export type OutItem = {
  id: string;
  job_id: string | null;
  parent_id: string | null;
  kind: "application" | "follow_up_1" | "follow_up_2";
  to_email: string;
  subject: string;
  body: string;
  status: "queued" | "sent" | "cancelled" | "failed";
  send_after: string;
  sent_at: string | null;
  error: string | null;
  ai_note: string | null;
  auto?: boolean;
  job_posts: { title: string; company: string } | null;
};
export type ReplyItem = {
  id: string;
  job_id: string | null;
  outbox_id: string | null;
  from_email: string;
  subject: string;
  received_at: string;
  snippet: string;
  suggested_stage: "interview" | "closed" | "replied";
  confirmed: boolean;
};

const KIND = { application: "Application", follow_up_1: "Follow-up 1", follow_up_2: "Follow-up 2" } as const;
const STAGE = { interview: "Interview", replied: "Replied", closed: "Closed" } as const;
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const jobName = (i: { job_posts: OutItem["job_posts"] }) => (i.job_posts ? `${i.job_posts.title} at ${i.job_posts.company || "a company"}` : "A deleted job");

export default function OutboxView({
  items,
  replies,
  account,
  loadError,
}: {
  items: OutItem[];
  replies: ReplyItem[];
  account: { email: string; last_checked_at: string | null } | null;
  loadError: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [alert, setAlert] = useState("");
  const [busy, start] = useTransition();
  const checked = useRef(false);
  const [now] = useState(() => Date.now());

  function act(fn: () => Promise<{ ok: true; note: string } | { ok: false; error: string }>) {
    if (busy) return;
    start(async () => {
      setAlert("");
      const r = await fn();
      if (r.ok) setNote(r.note);
      else setAlert(r.error);
      router.refresh();
    });
  }

  // Opening the Outbox checks for replies, at most once every 5 minutes.
  useEffect(() => {
    if (checked.current || !account) return;
    checked.current = true;
    const last = account.last_checked_at ? Date.parse(account.last_checked_at) : 0;
    if (Date.now() - last > 5 * 60_000) act(checkRepliesNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const queued = items.filter((i) => i.status === "queued").sort((a, b) => a.send_after.localeCompare(b.send_after));
  const failed = items.filter((i) => i.status === "failed");
  const repliedRoots = new Set(replies.map((r) => r.outbox_id));
  const apps = items.filter((i) => i.kind === "application" && i.status === "sent");
  const followUpsOf = (id: string) => items.filter((i) => i.parent_id === id);
  const noReply = apps.filter(
    (a) => !repliedRoots.has(a.id) && followUpsOf(a.id).some((f) => f.kind === "follow_up_2" && f.status === "sent" && f.sent_at && now - Date.parse(f.sent_at) > 5 * 86_400_000),
  );
  const waiting = apps.filter((a) => !repliedRoots.has(a.id) && !noReply.includes(a));
  const today = items.filter((i) => i.status === "sent" && i.sent_at && now - Date.parse(i.sent_at) < 86_400_000).length;

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.025em]">Outbox</h1>
        <p className="text-soft leading-normal">
          {account ? (
            <>
              Sending from {account.email}. {today} sent in the last 24 hours, out of 40 a day. Replies are checked every hour.
            </>
          ) : (
            <>
              Gmail is not connected.{" "}
              <a href="/profile#gmail" className="text-foreground underline underline-offset-2">
                Connect it in Profile
              </a>{" "}
              to send applications by email.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {account && (
            <Button variant="secondary" size="md" className="h-11 px-4" onClick={() => act(checkRepliesNow)} aria-disabled={busy}>
              {busy ? "Working…" : "Check for replies now"}
            </Button>
          )}
          <Button variant="ghost" size="md" className="text-soft h-11 px-3" href="/jobs">
            Back to Jobs
          </Button>
        </div>
        <p role="status" aria-live="polite" className="text-soft empty:hidden">
          {note}
        </p>
        {(alert || loadError) && (
          <p role="alert" className="text-danger">
            {alert || "The Outbox could not be loaded. Refresh the page."}
          </p>
        )}
      </header>

      <Group title="Replies" count={replies.length} empty="No replies yet. Most employers answer within 1 to 2 weeks.">
        {replies.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.subject || "(no subject)"}</span>
              <Tag tone={r.suggested_stage === "interview" ? "green" : r.suggested_stage === "closed" ? "neutral" : "blue"} size="sm">
                {r.confirmed ? STAGE[r.suggested_stage] : `Looks like: ${STAGE[r.suggested_stage]}`}
              </Tag>
            </div>
            <p className="caption-style text-soft">
              From {r.from_email} · {when(r.received_at)}
            </p>
            <p className="leading-normal">{r.snippet || "No text in the reply."}</p>
            {!r.confirmed && (
              <div role="group" aria-label={`Confirm the stage for the reply from ${r.from_email}`} className="flex flex-wrap gap-2">
                {(Object.keys(STAGE) as (keyof typeof STAGE)[]).map((s) => (
                  <Button key={s} variant={s === r.suggested_stage ? "primary" : "secondary"} size="md" className="h-11 px-4" onClick={() => act(() => confirmReply(r.id, s))} aria-disabled={busy}>
                    {STAGE[s]}
                  </Button>
                ))}
              </div>
            )}
          </li>
        ))}
      </Group>

      <Group title="Sending soon" count={queued.length} empty="Nothing is waiting to send.">
        {queued.map((i) => (
          <li key={i.id} className="flex flex-col gap-2 px-4 py-3.5">
            <p className="font-medium">
              {KIND[i.kind]}: {jobName(i)}
            </p>
            <p className="caption-style text-soft">
              {i.auto && <strong className="font-semibold text-(--tag-amber-text)">Auto-applied, cancel it if you don&rsquo;t want it · </strong>}
              To {i.to_email} · sends {when(i.send_after)} (Abuja time)
            </p>
            <details>
              <summary className="focus-visible:ring-ring inline-flex min-h-11 cursor-pointer items-center rounded outline-none focus-visible:ring-2">Read the email</summary>
              <p className="text-soft text-[14px] leading-relaxed whitespace-pre-line">{i.body}</p>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="md" className="h-11 px-4" onClick={() => act(() => sendEmailNow(i.id))} aria-disabled={busy}>
                Send now
                <span className="sr-only">
                  , {KIND[i.kind]} for {jobName(i)}
                </span>
              </Button>
              <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => act(() => cancelEmail(i.id))} aria-disabled={busy}>
                Cancel
                <span className="sr-only">
                  , {KIND[i.kind]} for {jobName(i)}
                </span>
              </Button>
            </div>
          </li>
        ))}
      </Group>

      {failed.length > 0 && (
        <Group title="Did not send" count={failed.length} empty="">
          {failed.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 bg-(--tag-amber-bg) px-4 py-3.5 text-(--tag-amber-text)">
              <p className="font-medium">
                {KIND[i.kind]}: {jobName(i)}
              </p>
              <p className="leading-normal">Gmail said: {i.error}</p>
              <Button variant="secondary" size="md" className="h-11 self-start px-4" onClick={() => act(() => retryEmail(i.id))} aria-disabled={busy}>
                Try again<span className="sr-only">, {jobName(i)}</span>
              </Button>
            </li>
          ))}
        </Group>
      )}

      <Group title="Sent, waiting for a reply" count={waiting.length} empty="No applications sent yet. Open a job and press Apply.">
        {waiting.map((a) => (
          <li key={a.id} className="flex flex-col gap-1 px-4 py-3.5">
            <p className="font-medium">{jobName(a)}</p>
            <p className="caption-style text-soft">
              Sent to {a.to_email} · {a.sent_at ? when(a.sent_at) : ""}
            </p>
            <ul className="caption-style text-soft flex flex-col gap-0.5">
              {followUpsOf(a.id).map((f) => (
                <li key={f.id}>
                  {KIND[f.kind]}: {f.status === "sent" ? `sent ${when(f.sent_at!)}` : f.status === "queued" ? `sends ${when(f.send_after)}` : f.status}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </Group>

      <Group title="No reply" count={noReply.length} empty="None yet. A job lands here 5 days after the second follow-up.">
        {noReply.map((a) => (
          <li key={a.id} className="px-4 py-3.5">
            <p className="font-medium">{jobName(a)}</p>
            <p className="caption-style text-soft">Both follow-ups sent. The app has stopped writing to {a.to_email}.</p>
          </li>
        ))}
      </Group>
    </>
  );
}

function Group({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  const id = title.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-4 text-[17px] font-semibold tracking-[-0.01em]">
        {title} <span className="text-soft font-normal tabular-nums">{count}</span>
      </h2>
      {count ? (
        <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.04]">{children}</ul>
      ) : (
        <p className="text-soft rounded-2xl bg-white/[0.04] px-4 py-3.5 text-[14px]">{empty}</p>
      )}
    </section>
  );
}
