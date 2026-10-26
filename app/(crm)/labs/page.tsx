import type { Metadata } from "next";
import { Page, PageHead, ViewTabs } from "@/components/workspace/parts";
import { LABS, NOT_USED, type Tool } from "@/lib/grow/tools";

export const metadata: Metadata = { title: "Labs · Sales CRM", robots: { index: false } };

const VIEWS = [
  { href: "/labs", label: "Worth a look", count: LABS.filter((t) => t.verdict === "maybe").length },
  { href: "/labs?view=no", label: "Not recommended", count: LABS.filter((t) => t.verdict === "no").length + NOT_USED.length },
];

export default async function LabsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "no" ? "no" : "maybe";
  const tools = LABS.filter((t) => t.verdict === view);
  return (
    <Page>
      <PageHead
        title="Labs"
        intro="Open-source tools that might help later. Each was checked for stars, last update, licence and open issues on 26 October 2026. Nothing here is installed."
        views={<ViewTabs label="Labs views" views={VIEWS} current={view === "no" ? "/labs?view=no" : "/labs"} />}
      />
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {tools.map((t) => (
          <ToolCard key={t.repo} t={t} />
        ))}
        {view === "no" &&
          NOT_USED.map((t) => (
            <li key={t.name} className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] p-5">
              <h2 className="text-[17px] font-semibold">{t.name}</h2>
              <p className="leading-normal">{t.why}</p>
            </li>
          ))}
      </ul>
    </Page>
  );
}

function ToolCard({ t }: { t: Tool }) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold">
          <a href={`https://github.com/${t.repo}`} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">
            {t.name}
            <span className="sr-only"> on GitHub (opens in a new tab)</span>
          </a>
        </h2>
        <p className="text-soft font-mono text-[13px] break-all">{t.repo}</p>
      </div>
      <p className="leading-normal">{t.what}</p>
      <p className="leading-normal">
        <span className="font-medium">Could help with:</span> {t.use}
      </p>
      {t.why && <p className="text-soft text-[14px] leading-normal">{t.why}</p>}
      <p className="text-soft text-[13px] tabular-nums">
        {t.stars} stars · updated {t.updated} · {t.licence} · {t.issues} open issues
      </p>
    </li>
  );
}
