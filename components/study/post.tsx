"use client";

import { useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import { LINK } from "@/components/workspace/parts";
import { postNow } from "@/app/(crm)/study/actions";
import { type DailyPost, postParts, xIntent } from "@/lib/social/parts";

const CARD = "rounded-2xl bg-white/[0.04] outline outline-1 -outline-offset-1 outline-white/[0.06]";

export function PostCard({ post: first }: { post: DailyPost | null }) {
  const [post, setPost] = useState(first);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [pending, start] = useTransition();

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied.`);
    } catch {
      setStatus("Copying is blocked here. Select the text instead.");
    }
  }

  if (!post)
    return (
      <div className={`${CARD} flex flex-col gap-3 p-5`}>
        <p className="text-soft text-[15px]">Today&rsquo;s post arrives with the morning run, or write it now.</p>
        <Button
          variant="secondary"
          size="md"
          className="h-10 self-start rounded-xl px-4"
          aria-disabled={pending}
          onClick={() =>
            !pending &&
            start(async () => {
              setProblem("");
              const r = await postNow();
              if (r.ok) setPost(r.post);
              else setProblem(r.error);
            })
          }
        >
          {pending ? "Writing the post…" : "Write today's post"}
        </Button>
        <p role="status" aria-live="polite" className="sr-only">
          {pending ? "Writing the post." : ""}
        </p>
        {problem && (
          <p role="alert" className="text-danger text-[14px]">
            {problem}
          </p>
        )}
      </div>
    );

  const parts = postParts(post);
  return (
    <div className={`${CARD} flex flex-col gap-4 p-5`}>
      <p className="text-soft text-[13px] font-medium">From today&rsquo;s topic: {post.topic}</p>
      <ol className="flex flex-col gap-3">
        {parts.map((text, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl bg-white/[0.04] px-4 py-3">
            <p className="text-soft text-[13px] font-medium tabular-nums">
              {i === 0 ? "Post" : `Reply ${i}`} · {text.length} of 280 characters
            </p>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{text}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="md" className="h-10 px-3" onClick={() => copy(i === 0 ? "The post" : `Reply ${i}`, text)}>
                Copy<span className="sr-only"> {i === 0 ? "the post" : `reply ${i}`}</span>
              </Button>
              {i === 0 && (
                <a href={xIntent(text)} target="_blank" rel="noreferrer" className="bg-secondary focus-visible:ring-ring inline-flex h-10 items-center rounded-xl px-4 text-[14px] font-medium outline-none focus-visible:ring-2">
                  Post on X<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1 text-[14px]">
        {post.quote ? (
          <p>
            Quote checked on{" "}
            <a href={post.quote.url} target="_blank" rel="noreferrer" className={LINK}>
              {post.quote.author}&rsquo;s Wikiquote page<span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </p>
        ) : (
          <p className="text-soft">No quote today: none could be checked on Wikiquote, so none is shown.</p>
        )}
        {post.refs.map((r) => (
          <p key={r.url}>
            Reference:{" "}
            <a href={r.url} target="_blank" rel="noreferrer" className={LINK}>
              {r.title} on Wikipedia<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        ))}
      </div>
      <p className="text-soft text-[13px]">Written by AI ({post.from}). Read it before you post; it goes out under your name.</p>
      <p role="status" aria-live="polite" className="text-soft text-[13px] empty:hidden">
        {status}
      </p>
    </div>
  );
}
