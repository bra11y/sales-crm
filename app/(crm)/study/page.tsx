import type { Metadata } from "next";
import Link from "next/link";
import { LessonCard } from "@/components/study/study";
import { LINK, Page, PageHead } from "@/components/workspace/parts";
import { dayKey } from "@/lib/motivation";
import { CATEGORIES, findTopic, type Lesson, slugOf, topicsFor } from "@/lib/study/topics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Daily study · Sales CRM", robots: { index: false } };
export const maxDuration = 120;

export default async function Study({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic: picked } = await searchParams;
  const today = topicsFor(dayKey());
  const chosen = picked ? findTopic(picked) : null;
  const shown = chosen ? [chosen] : today;
  const db = await createSupabaseServerClient();
  const { data } = await db.from("study_lessons").select("slug, lesson").in("slug", shown.map((t) => t.slug));
  const lessons = new Map((data ?? []).map((r) => [r.slug as string, r.lesson as Lesson]));
  const todaySlugs = new Set(today.map((t) => t.slug));

  return (
    <Page>
      <PageHead
        title="Daily study"
        intro="Three ideas a day from psychology, neuroscience, finance, technology, science, philosophy, culture and writing, each with an example, a way to use it and a diagram. All 80 come round in about four weeks. Today's three are in your morning email too."
      />

      <section aria-labelledby="today-h" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="today-h" className="text-[22px] font-semibold tracking-[-0.015em]">
            {chosen ? chosen.name : "Today's three"}
          </h2>
          {chosen && (
            <Link href="/study" className={`${LINK} text-[14px]`}>
              Back to today&rsquo;s three
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {shown.map((t) => (
            <LessonCard key={t.slug} topic={t} lesson={lessons.get(t.slug) ?? null} />
          ))}
        </div>
      </section>

      <section aria-labelledby="all-h" className="flex flex-col gap-4">
        <h2 id="all-h" className="text-[22px] font-semibold tracking-[-0.015em]">
          All topics
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] p-4 outline outline-1 -outline-offset-1 outline-white/[0.06]">
              <h3 className="text-[15px] font-semibold">{c.name}</h3>
              <ul className="flex flex-col gap-0.5">
                {c.topics.map((name) => {
                  const slug = `${c.id}-${slugOf(name)}`;
                  return (
                    <li key={slug}>
                      <Link
                        href={`/study?topic=${slug}`}
                        aria-current={chosen?.slug === slug ? "page" : undefined}
                        className="focus-visible:ring-ring text-soft hover:text-foreground flex min-h-9 items-center justify-between gap-2 rounded-lg px-2 text-[14px] outline-none hover:bg-white/[0.05] focus-visible:ring-2 aria-[current=page]:bg-white/[0.09] aria-[current=page]:text-foreground"
                      >
                        <span>{name}</span>
                        {todaySlugs.has(slug) && <span className="text-[12px] font-medium text-(--tag-green-text)">Today</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </Page>
  );
}
