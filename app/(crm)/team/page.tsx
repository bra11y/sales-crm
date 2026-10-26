import type { Metadata } from "next";
import Link from "next/link";
import { Group, LINK, Page, PageHead } from "@/components/workspace/parts";
import { formatMoney } from "@/lib/crm/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team · Sales CRM", robots: { index: false } };

type Member = { role: string; user_id: string; profiles: { name: string; title: string | null; email: string | null } | null };

export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();
  const [members, companies] = await Promise.all([
    supabase.from("workspace_members").select("role, user_id, profiles(name, title, email)").eq("workspace_id", 1),
    supabase.from("companies").select("owner_id, pipeline_value_minor, currency").eq("workspace_id", 1),
  ]);
  const rows = (members.data ?? []) as unknown as Member[];
  const owned = (id: string) => (companies.data ?? []).filter((c) => c.owner_id === id);
  const unassigned = (companies.data ?? []).filter((c) => !c.owner_id).length;

  return (
    <Page>
      <PageHead title="Team" intro="Who can see this workspace, and the companies each person looks after." />
      <Group title="People" count={rows.length} empty="No members found.">
        {rows.map((m) => {
          const mine = owned(m.user_id);
          const totals: Record<string, number> = {};
          for (const c of mine) totals[c.currency] = (totals[c.currency] ?? 0) + c.pipeline_value_minor;
          return (
            <li key={m.user_id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
              <span className="flex flex-col">
                <span className="font-medium">
                  {m.profiles?.name ?? "Unnamed"} <span className="text-soft font-normal">· {m.role === "owner" ? "Owner" : "Member"}</span>
                </span>
                <span className="text-soft text-[14px]">{[m.profiles?.title, m.profiles?.email].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="text-soft text-[14px] tabular-nums">
                {mine.length} {mine.length === 1 ? "company" : "companies"}
                {Object.keys(totals).length
                  ? ` · ${Object.entries(totals)
                      .map(([c, v]) => formatMoney(v, c))
                      .join(" · ")}`
                  : ""}
              </span>
            </li>
          );
        })}
      </Group>
      {unassigned > 0 && (
        <p className="text-soft px-4">
          {unassigned} {unassigned === 1 ? "company has" : "companies have"} no owner yet. See them on the{" "}
          <Link href="/" className={LINK}>
            Companies
          </Link>{" "}
          page.
        </p>
      )}
      <section aria-labelledby="invite" className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] px-5 py-5">
        <h2 id="invite" className="text-[17px] font-semibold">
          Inviting teammates
        </h2>
        <p className="text-soft max-w-[40em] leading-normal">
          Invites come with the multi-user update. Each person will get their own login, their own job search and Gmail, and only see the companies they are given. Until then, this workspace is yours
          alone.
        </p>
      </section>
    </Page>
  );
}
