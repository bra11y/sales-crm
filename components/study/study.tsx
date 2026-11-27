"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import FlowDiagram from "@/components/learn/flow-diagram";
import { saveStudyNote, studyNow } from "@/app/(crm)/study/actions";
import type { Lesson, Topic } from "@/lib/study/topics";

const CARD = "rounded-2xl bg-white/[0.04] outline outline-1 -outline-offset-1 outline-white/[0.06]";

export function LessonCard({ topic, lesson: first, level = 3 }: { topic: Topic; lesson: Lesson | null; level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  const [lesson, setLesson] = useState(first);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [pending, start] = useTransition();

  return (
    <article aria-labelledby={`t-${topic.slug}`} aria-busy={pending} className={`${CARD} flex flex-col gap-4 p-5`}>
      <div className="flex flex-col gap-1">
        <p className="text-soft text-[13px] font-medium">{topic.category}</p>
        <H id={`t-${topic.slug}`} className="text-[20px] leading-tight font-semibold tracking-[-0.015em]">
          {topic.name}
        </H>
      </div>

      {lesson ? (
        <>
          <p className="text-[15px] leading-relaxed">{lesson.explain}</p>
          <div className="flex flex-col gap-1">
            <p className="text-soft text-[13px] font-medium">An example</p>
            <p className="text-[15px] leading-relaxed">{lesson.example}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-soft text-[13px] font-medium">Use it this week</p>
            <p className="text-[15px] leading-relaxed">{lesson.use}</p>
          </div>
          <FlowDiagram steps={lesson.flow} title={topic.name} />
          {lesson.question && (
            <p className="rounded-xl bg-white/[0.04] px-4 py-3 text-[15px] leading-relaxed">
              <span className="text-soft block text-[13px] font-medium">Think about</span>
              {lesson.question}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {note ? (
              <Link href={`/notes/${note}`} className="bg-secondary focus-visible:ring-ring inline-flex h-10 items-center rounded-xl px-4 text-[14px] font-medium outline-none focus-visible:ring-2">
                Open the note
              </Link>
            ) : (
              <Button
                variant="secondary"
                size="md"
                className="h-10 rounded-xl px-4"
                aria-disabled={pending}
                onClick={() =>
                  !pending &&
                  start(async () => {
                    const r = await saveStudyNote(topic.slug);
                    if (r.ok) setNote(r.noteId);
                    else setProblem(r.error);
                  })
                }
              >
                Save to Notes for review<span className="sr-only">: {topic.name}</span>
              </Button>
            )}
            <p className="text-soft text-[13px]">Written by AI ({lesson.from}). Check anything you will repeat.</p>
          </div>
        </>
      ) : (
        <Button
          variant="secondary"
          size="md"
          className="h-10 self-start rounded-xl px-4"
          aria-disabled={pending}
          onClick={() =>
            !pending &&
            start(async () => {
              setProblem("");
              const r = await studyNow(topic.slug);
              if (r.ok) setLesson(r.lesson);
              else setProblem(r.error);
            })
          }
        >
          {pending ? "Writing the lesson…" : "Study this now"}
          <span className="sr-only">: {topic.name}</span>
        </Button>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Working…" : note ? "Saved to Notes." : ""}
      </p>
      {problem && (
        <p role="alert" className="text-danger text-[14px]">
          {problem}
        </p>
      )}
    </article>
  );
}
