import RegisterSW from "@/components/_common/register-sw";
import Sidebar from "@/components/_common/sidebar/sidebar";
import MobileBar from "@/components/_common/mobile-bar";
import Tour from "@/components/_common/tour";
import WhatsNew from "@/components/_common/whats-new";
import type { SidebarData } from "@/components/_common/sidebar/sidebar-content";
import { asRole, can } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const WEEK = 7 * 86_400_000;

// Small counts for the sidebar. A failed query shows zero, never breaks the page.
async function sidebarData(): Promise<SidebarData> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const [role, products, companies, trials, queued, live, bills] = await Promise.all([
    supabase.rpc("my_role"),
    supabase.from("products").select("slug, name").order("name"),
    supabase.from("companies").select("product").eq("workspace_id", 1),
    supabase
      .from("subscriptions")
      .select("company_id", { count: "exact", head: true })
      .eq("status", "trialing")
      .gt("renews_at", now.toISOString())
      .lte("renews_at", new Date(now.getTime() + WEEK).toISOString()),
    supabase.from("applications_outbox").select("id", { count: "exact", head: true }).eq("status", "queued"),
    supabase.from("job_posts").select("id", { count: "exact", head: true }).in("status", ["applied", "replied", "interview", "offer"]),
    supabase.from("bills").select("id", { count: "exact", head: true }).eq("status", "active").lte("next_due", soon),
  ]);
  const counts = new Map<string, number>();
  for (const c of companies.data ?? []) counts.set(c.product, (counts.get(c.product) ?? 0) + 1);
  return {
    role: asRole(role.data),
    // Job applications have their own board under Job search, so they are not a sales pipeline here.
    pipelines: (products.data ?? []).filter((p) => counts.has(p.slug) && p.slug !== "applications").map((p) => ({ slug: p.slug, name: p.name, count: counts.get(p.slug)! })),
    trialsEnding: trials.count ?? 0,
    queued: queued.count ?? 0,
    applications: live.count ?? 0,
    billsDue: bills.count ?? 0,
  };
}

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const data = await sidebarData();
  return (
    <div className="flex h-dvh max-w-full overflow-hidden">
      <a
        href="#main"
        className="bg-background text-foreground focus-visible:ring-ring sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus-visible:ring-2"
      >
        Skip to content
      </a>
      <Sidebar data={data} />
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
        <RegisterSW />
        <MobileBar />
        <WhatsNew />
        <Tour crm={can(data.role, "crm:use")} />
        {children}
      </main>
    </div>
  );
}
