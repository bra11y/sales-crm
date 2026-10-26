import type { Metadata } from "next";
import { headers } from "next/headers";
import AppMark from "@/components/sales/app-mark";
import PageShell from "@/components/sales/page-shell";
import { receivingStatus } from "@/components/sales/status-text";
import { loadSales } from "@/lib/crm/sales-query";

export const metadata: Metadata = { title: "Integrations · Sales CRM", robots: { index: false } };

function secretName(slug: string) {
  return `CRM_SECRET_${slug.toUpperCase().replaceAll("-", "_")}`;
}

export default async function IntegrationsPage() {
  const [{ products, lastEvent }, h] = await Promise.all([loadSales(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const apps = products.filter((p) => p.slug !== "direct");
  const now = new Date();

  return (
    <PageShell title="Integrations" intro="The apps that send sales to this CRM, and the services it can connect to. Each app keeps its own database; it only sends signed events here.">
      <section aria-labelledby="apps-heading" className="flex flex-col gap-4">
        <h2 id="apps-heading">Your apps</h2>
        <ul className="flex flex-col">
          {apps.map((app) => {
            const status = receivingStatus(lastEvent[app.slug], now);
            const secretSet = Boolean(process.env[secretName(app.slug)]);
            return (
              <li key={app.slug} className="border-foreground/10 flex flex-col gap-4 border-t py-5">
                <div className="flex items-center gap-3">
                  <AppMark name={app.name} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="font-medium">{app.name}</h3>
                    {app.host && <span className="caption-style text-subtle truncate">{app.host}</span>}
                  </div>
                  <p className="text-right">
                    <span className="font-medium">{status.word}</span>
                    <span className="caption-style text-subtle block">{status.detail}</span>
                  </p>
                </div>
                <details className="group rounded-lg">
                  <summary className="text-subtle hover:text-foreground focus-visible:ring-ring w-fit cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:outline-none">
                    How to connect {app.name}
                  </summary>
                  <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5">
                    <li>
                      In {app.name}&rsquo;s Vercel project, set <code>CRM_INGEST_URL</code> to <code>{origin}</code>.
                    </li>
                    <li>
                      Set <code>CRM_INGEST_SECRET</code> to the same value as <code>{secretName(app.slug)}</code> here.{" "}
                      <span className="text-subtle">{secretSet ? "This CRM has its secret set." : "This CRM does not have its secret yet."}</span>
                    </li>
                    {app.slug === "lux" && (
                      <li>
                        Also set <code>CRM_PRODUCT</code> to <code>lux</code>.
                      </li>
                    )}
                    <li>
                      Events arrive at <code className="break-all">{`${origin}/api/ingest/${app.slug}`}</code>.
                    </li>
                  </ol>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="services-heading" className="flex flex-col gap-4">
        <h2 id="services-heading">Services</h2>
        <ul className="flex flex-col">
          <li className="border-foreground/10 flex items-center gap-3 border-t py-5">
            <AppMark name="Email" />
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="font-medium">Email</h3>
              <span className="caption-style text-subtle">Write and send emails from a company page, with unsubscribe handled for you.</span>
            </div>
            <span className="font-medium">Coming soon</span>
          </li>
          <li className="border-foreground/10 flex items-center gap-3 border-t py-5">
            <AppMark name="Another app" />
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="font-medium">Connect another app</h3>
              <span className="caption-style text-subtle">Add a new app and get its signing secret from this page. Until then, new apps are added in code.</span>
            </div>
            <span className="font-medium">Coming soon</span>
          </li>
        </ul>
      </section>
    </PageShell>
  );
}
