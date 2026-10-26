"use client";

import { useId, useState } from "react";
import type { ReadCheck } from "@/lib/apply/compose";

// A post that asks you to prove you read it ("mention the word BLOOM and tag ...").
// The word and tag go into your application only after you say you read the post.
export default function ReadCheckBox({
  check,
  postUrl,
  level = 4,
  onChange,
}: {
  check: ReadCheck;
  postUrl?: string;
  level?: 3 | 4;
  onChange: (read: boolean, v: { word: string; tag: string }) => void;
}) {
  const id = useId();
  const [read, setRead] = useState(false);
  const [word, setWord] = useState(check.word);
  const [tag, setTag] = useState(check.tag);
  const update = (r: boolean, w = word, t = tag) => {
    setRead(r);
    onChange(r, { word: w.trim(), tag: t.trim().replace(/^#/, "") });
  };
  const H = level === 3 ? "h3" : "h4";
  const field = "border-line-strong bg-background/40 focus-visible:ring-ring h-11 w-full rounded-xl border px-3 font-mono text-[14px] outline-none focus-visible:ring-2";
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3 rounded-2xl border border-(--tag-amber-border) bg-(--tag-amber-bg) p-4 text-(--tag-amber-text)">
      <H id={`${id}-h`} className="text-[15px] font-semibold">
        This post checks that you read it
      </H>
      <blockquote className="border-l-2 border-current pl-3 text-[14px] leading-normal break-words">{check.sentence}</blockquote>
      <p className="text-[14px] leading-normal">
        Read the whole post
        {postUrl ? (
          <>
            {" "}
            (
            <a href={postUrl} target="_blank" rel="noopener" className="underline underline-offset-2">
              open it<span className="sr-only"> in a new tab</span>
            </a>
            )
          </>
        ) : null}
        . {check.tag ? "The tag can be made for whoever opened the page, so copy it from the post as you see it in your browser." : ""}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {check.word && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-word`} className="text-[13px] font-medium">
              Word
            </label>
            <input id={`${id}-word`} value={word} onChange={(e) => (setWord(e.target.value), read && update(true, e.target.value))} className={field} />
          </div>
        )}
        {check.tag && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-tag`} className="text-[13px] font-medium">
              Tag
            </label>
            <input id={`${id}-tag`} value={tag} onChange={(e) => (setTag(e.target.value), read && update(true, word, e.target.value))} className={field} />
          </div>
        )}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-medium">
        <input type="checkbox" checked={read} onChange={(e) => update(e.target.checked)} className="accent-primary size-5 shrink-0" />I read the whole post. Add{" "}
        {check.subject ? "these to the subject and letter" : "these to my letter"}.
      </label>
    </section>
  );
}
