import type { Metadata } from "next";
import ApplyForm, { type ApplyStart } from "@/components/apply/apply-form";
import PageShell from "@/components/sales/page-shell";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Apply · Sales CRM", robots: { index: false } };

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ job?: string | string[] }> }) {
  const { job } = await searchParams;
  const jobId = typeof job === "string" && /^[0-9a-f-]{36}$/i.test(job) ? job : null;
  const supabase = await createSupabaseServerClient();
  const [profile, post] = await Promise.all([
    loadProfile(supabase),
    jobId ? supabase.from("job_posts").select("id, title, company, description, url").eq("id", jobId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const start: ApplyStart | undefined = post.data
    ? { jobId: post.data.id, company: post.data.company, role: post.data.title, jd: `${post.data.title}\n${post.data.company ? `At ${post.data.company}\n` : ""}\n${post.data.description}\n\nJob post: ${post.data.url}` }
    : undefined;

  return (
    <PageShell
      title="Apply"
      intro={
        start
          ? `The job post for ${start.role} is filled in. Press “Read the job post” to build a CV and cover letter from your profile.`
          : "Paste a job post or project brief. Get a CV, cover letter or proposal built only from your true facts, then save it here to track it from Applied to Won."
      }
    >
      <ApplyForm key={start?.jobId ?? "blank"} facts={profile?.stored} start={start} />
    </PageShell>
  );
}
