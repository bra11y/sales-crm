import type { Metadata } from "next";
import Scholarships from "@/components/grow/scholarships";
import { Page, PageHead } from "@/components/workspace/parts";
import { type Scholarship, SOURCES, sortScholarships } from "@/lib/grow/grow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Scholarships · Sales CRM", robots: { index: false } };

export default async function ScholarshipsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("scholarships").select("id, name, provider, url, level, country, amount, deadline, status, steps, note");
  const now = new Date();
  const list = sortScholarships((data ?? []) as Scholarship[], now);
  return (
    <Page>
      <PageHead title="Scholarships" intro="Keep every scholarship you are going for in one place: the deadline, what it needs, and how far along you are. The soonest deadline is always first." />
      {error && (
        <p role="alert" className="text-danger">
          Your scholarships could not be loaded. If this is new, the database update may not be live yet.
        </p>
      )}
      <Scholarships list={list} now={now.toISOString()} />
      <section aria-labelledby="sources" className="flex flex-col gap-3">
        <h2 id="sources" className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
          Big programmes to look at
        </h2>
        <p className="text-soft px-1 leading-normal">Official sites only. Dates change every year, so check each site for this year&rsquo;s deadline before you add it.</p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <li key={s.name} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-white/[0.04] px-4 py-3">
              <a href={s.url} target="_blank" rel="noopener" className="font-medium break-words underline underline-offset-2">
                {s.name}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span className="text-soft text-[14px]">
                {s.where} · {s.level}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
