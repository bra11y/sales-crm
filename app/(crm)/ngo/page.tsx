import type { Metadata } from "next";
import Link from "next/link";
import { Empty, LINK, Page, PageHead } from "@/components/workspace/parts";
import { BAND } from "@/components/jobs/labels";
import { currentUserId, loadProfile } from "@/lib/jobs/profile";
import { ngoLinks } from "@/lib/jobs/ngo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "NGO jobs · Sales CRM", robots: { index: false } };

type Row = { id: string; title: string; company: string; location: string; description: string; band: string | null; hidden_reason: string | null; posted_at: string | null; status: string };

const closes = (d: string) => d.match(/^Closing date: (\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const TONE: Record<string, string> = {
  green: "bg-(--tag-green-bg) text-(--tag-green-text)",
  blue: "bg-(--tag-blue-bg) text-(--tag-blue-text)",
  neutral: "bg-white/[0.06] text-soft",
};
const OUT = "inline-flex min-h-10 items-center rounded-xl bg-secondary px-3.5 text-[14px] font-medium outline-none hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-ring";

export default async function NgoJobs() {
  const supabase = await createSupabaseServerClient();
  const userId = await currentUserId();
  const [jobs, sent, prof] = await Promise.all([
    supabase.from("job_posts").select("id, title, company, location, description, band, hidden_reason, posted_at, status").eq("user_id", userId).eq("source", "reliefweb").in("status", ["new", "saved"]).order("score", { ascending: false }).limit(200),
    supabase.from("job_posts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "reliefweb").not("status", "in", "(new,saved,dismissed)"),
    loadProfile(supabase),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const rows = ((jobs.data ?? []) as Row[]).filter((j) => (closes(j.description) ?? "9999") >= today);
  const fit = rows.filter((j) => !j.hidden_reason);
  const elsewhere = rows.length - fit.length;
  const titles = (prof?.preferences.titles.length ? prof.preferences.titles : ["Communications Officer"]).slice(0, 4);
  const sourceOff = prof ? !prof.preferences.sources.includes("reliefweb") : false;

  return (
    <Page>
      <PageHead
        title="NGO jobs"
        intro="International NGOs and the UN often pay better than local companies, and new projects open roles all year. Jobs from ReliefWeb arrive with your morning search."
      />

      {sourceOff && (
        <p role="status" className="rounded-xl bg-(--tag-amber-bg) px-4 py-3 text-[14px] text-(--tag-amber-text)">
          ReliefWeb is off in your job boards, so no NGO jobs are searched. Turn it on in{" "}
          <Link href="/settings" className="font-medium underline underline-offset-2">
            Settings
          </Link>
          .
        </p>
      )}

      <section aria-labelledby="found-h" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="found-h" className="text-[22px] font-semibold tracking-[-0.015em]">
            Open NGO jobs that fit you <span className="text-soft tabular-nums">{fit.length}</span>
          </h2>
          <p className="text-soft text-[14px] tabular-nums">
            Best fit first. {elsewhere ? `${elsewhere} more are on-site outside Nigeria, hidden on Jobs. ` : ""}
            {sent.count ? `You have applied to ${sent.count}.` : ""}
          </p>
        </div>
        {jobs.error ? (
          <p role="alert" className="text-danger">
            NGO jobs could not be loaded. Try again in a minute.
          </p>
        ) : fit.length ? (
          <ul aria-label="NGO jobs" className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.04] outline outline-1 -outline-offset-1 outline-white/[0.06]">
            {fit.slice(0, 60).map((j) => {
              const band = j.band ? BAND[j.band] : null;
              const by = closes(j.description);
              return (
                <li key={j.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h3 className="text-[16px] leading-snug font-semibold">{j.title}</h3>
                    <p className="text-soft text-[14px]">{[j.company, j.location].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    {band && <span className={`rounded-md px-2 py-0.5 text-[13px] font-medium ${TONE[band.tone]}`}>{band.label} fit</span>}
                    {by && <span className="text-soft text-[13px] tabular-nums">Closes {day(by)}</span>}
                    <Link href={`/jobs?open=${j.id}`} className={OUT}>
                      Open and apply<span className="sr-only">: {j.title}</span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="No NGO jobs yet" action={<a href="#search-h" className={LINK}>Search the NGO sites by hand</a>}>
            ReliefWeb jobs arrive with the next morning search. Until then, use the searches below.
          </Empty>
        )}
      </section>

      <section aria-labelledby="search-h" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="search-h" className="text-[22px] font-semibold tracking-[-0.015em]">
            Search the NGO sites
          </h2>
          <p className="text-soft text-[14px]">Devex and Impactpool block automatic reading, so these open their search with your job titles filled in.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {titles.map((t) => (
            <div key={t} className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4 outline outline-1 -outline-offset-1 outline-white/[0.06]">
              <h3 className="text-[16px] font-semibold">{t}</h3>
              <ul className="flex flex-wrap gap-2">
                {ngoLinks(t).map((l) => (
                  <li key={l.name}>
                    <a href={l.url} target="_blank" rel="noreferrer" className={OUT}>
                      {l.name}
                      <span className="sr-only">
                        : {t}. {l.note} (opens in a new tab)
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="steps-h" className="flex flex-col gap-4">
        <h2 id="steps-h" className="text-[22px] font-semibold tracking-[-0.015em]">
          How to get into an NGO
        </h2>
        <ol className="flex flex-col gap-3">
          {[
            { title: "Pick a field", body: "Healthcare, project management, administration, community development, or communications and digital work. Add it as a job title in Settings so the search looks for it." },
            {
              title: "Get the free NGO certificates",
              body: (
                <>
                  <a href="https://www.disasterready.org" target="_blank" rel="noreferrer" className={LINK}>
                    DisasterReady<span className="sr-only"> (opens in a new tab)</span>
                  </a>{" "}
                  has free humanitarian courses with certificates. Coursera has more, many free to audit. Add them to your Profile so your CV shows them.
                </>
              ),
            },
            { title: "Search ReliefWeb, Devex and Impactpool", body: "ReliefWeb is searched for you every morning. Use the buttons above for the other two once a week." },
            {
              title: "Ask NGO staff for referrals",
              body: (
                <>
                  <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${titles[0]} NGO Nigeria`)}`} target="_blank" rel="noreferrer" className={LINK}>
                    Find people doing this job at NGOs on LinkedIn<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  . Ask one short question about their work before you ask for a referral.
                </>
              ),
            },
            { title: "Apply steadily", body: "Entry-level, internship and project-based roles all count. Projects end, so NGO staff move often, and new roles open all year." },
          ].map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-2xl bg-white/[0.04] p-4 outline outline-1 -outline-offset-1 outline-white/[0.06]">
              <span aria-hidden className="text-soft grid size-7 shrink-0 place-items-center rounded-full text-[13px] tabular-nums outline outline-1 outline-white/20">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-[16px] font-semibold">{s.title}</h3>
                <p className="text-[14px] leading-normal">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-soft text-[13px]">Steps from a thread by @RemotejobWtessy on X, 25 November 2026.</p>
      </section>
    </Page>
  );
}
