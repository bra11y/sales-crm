import Sidebar from "@/components/_common/sidebar/sidebar";
import type { SidebarData } from "@/components/_common/sidebar/sidebar-content";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const WEEK = 7 * 86_400_000;

// Small counts for the sidebar. A failed query shows zero, never breaks the page.
async function sidebarData(): Promise<SidebarData> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const [products, companies, trials, queued] = await Promise.all([
    supabase.from("products").select("slug, name").order("name"),
    supabase.from("companies").select("product").eq("workspace_id", 1),
    supabase.from("subscriptions").select("company_id", { count: "exact", head: true }).eq("status", "trialing").gt("renews_at", now.toISOString()).lte("renews_at", new Date(now.getTime() + WEEK).toISOString()),
    supabase.from("applications_outbox").select("id", { count: "exact", head: true }).eq("status", "queued"),
  ]);
  const counts = new Map<string, number>();
  for (const c of companies.data ?? []) counts.set(c.product, (counts.get(c.product) ?? 0) + 1);
  return {
    pipelines: (products.data ?? []).filter((p) => counts.has(p.slug)).map((p) => ({ slug: p.slug, name: p.name, count: counts.get(p.slug)! })),
    trialsEnding: trials.count ?? 0,
    queued: queued.count ?? 0,
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
        {children}
      </main>
    </div>
  );
}
