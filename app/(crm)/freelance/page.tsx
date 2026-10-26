import type { Metadata } from "next";
import Link from "next/link";
import AuditOutreach, { type Prospect, type Suggestion } from "@/components/grow/audit-outreach";
import { Page, PageHead, ViewTabs } from "@/components/workspace/parts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Freelance and audits · Sales CRM", robots: { index: false } };

const CONTRACT = /\b(contract|contractor|freelance|freelancer|part[- ]time|short[- ]term|temporary|temp|consultant|consulting|project[- ]based|audit|audits|gig|retainer)\b/i;

export default async function FreelancePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "audits" ? "audits" : "jobs";
  const supabase = await createSupabaseServerClient();
  const [{ data: jobs }, { data: prospects }] = await Promise.all([
    supabase.from("job_posts").select("id, title, company, employment_type, description, band, hidden_reason, status, company_info").order("score", { ascending: false }).limit(800),
    supabase.from("audit_prospects").select("id, company, url, contact_name, contact_email, score, findings, status, checked_at").order("checked_at", { ascending: false, nullsFirst: false }),
  ]);
  // The job type or title says it: an "audits" duty inside a full-time post is not freelance work.
  const contract = (jobs ?? []).filter((j) => j.status !== "dismissed" && CONTRACT.test(`${j.employment_type ?? ""} ${j.title}`));
  const checked = new Set((prospects ?? []).map((p) => p.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/.*$/, "")));
  const suggestions: Suggestion[] = [];
  for (const j of jobs ?? []) {
    const site = (j.company_info as { website?: string | null } | null)?.website;
    const host = site?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
    if (site && host && !checked.has(host) && !suggestions.some((s) => s.website === site)) suggestions.push({ company: j.company, website: site });
    if (suggestions.length >= 12) break;
  }
  const views = [
    { href: "/freelance", label: "Contract and freelance jobs", count: contract.length },
    { href: "/freelance?view=audits", label: "Audit outreach", count: (prospects ?? []).length },
  ];

  return (
    <Page>
      <PageHead
        title="Freelance and audits"
        intro="Short-term work: contract and freelance jobs from your job search, and companies whose websites fail basic accessibility checks, with an outreach email drafted for you to send."
        views={<ViewTabs label="Freelance views" views={views} current={view === "audits" ? "/freelance?view=audits" : "/freelance"} />}
      />
      {view === "audits" ? (
        <AuditOutreach prospects={(prospects ?? []) as Prospect[]} suggestions={suggestions} />
      ) : contract.length === 0 ? (
        <p className="text-soft rounded-2xl bg-white/[0.04] p-5 leading-normal">No contract or freelance jobs yet. They show here as the job search finds them.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.04]">
          {contract.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <Link href={`/jobs?open=${j.id}`} className="font-medium break-words underline-offset-2 hover:underline">
                  {j.title}
                </Link>
                <span className="text-soft text-[14px]">
                  {j.company || "Company not named"}
                  {j.employment_type ? ` · ${j.employment_type}` : ""}
                  {j.hidden_reason ? ` · Hidden: ${j.hidden_reason}` : ""}
                </span>
              </div>
              <span className="text-soft text-[13px] capitalize">{j.band} fit</span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
