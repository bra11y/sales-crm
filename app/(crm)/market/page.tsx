import type { Metadata } from "next";
import { Empty, LINK, Page, PageHead } from "@/components/workspace/parts";
import RefreshMarket from "@/components/market/refresh";
import { CURRENCY_LABEL, type Headline, MARKET_SOURCES, type Rate } from "@/lib/market/market";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/motivation";

export const metadata: Metadata = { title: "Markets · Sales CRM", robots: { index: false } };
export const maxDuration = 120;

type Row = { day: string; rates: Rate[]; news: Headline[]; brief: string | null; brief_from: string | null; errors: string[]; updated_at: string };

const naira = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const change = (now: number, then: number | null) => (then ? ((now - then) / then) * 100 : null);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

// A higher naira figure means the naira bought less, so it is shown as weaker, not as "up".
function Move({ pct, span }: { pct: number | null; span: string }) {
  if (pct === null) return <span className="text-soft">No {span} figure</span>;
  if (Math.abs(pct) < 0.005) return <span className="text-soft">Flat {span}</span>;
  const weaker = pct > 0;
  return (
    <span className={weaker ? "text-(--tag-red-text)" : "text-(--tag-green-text)"}>
      <span aria-hidden>{weaker ? "▲" : "▼"} </span>
      {Math.abs(pct).toFixed(2)}% {span}, naira {weaker ? "weaker" : "stronger"}
    </span>
  );
}

export default async function Markets() {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("market_daily").select("day, rates, news, brief, brief_from, errors, updated_at").order("day", { ascending: false }).limit(1).maybeSingle();
  const row = data as Row | null;
  const today = dayKey();

  return (
    <Page>
      <PageHead
        title="Markets"
        intro="The CBN's official naira rates and Nigerian market news, read every morning, with a plain explanation of what moved. It explains the news; it does not tell you what to buy or sell."
        actions={row?.day !== today ? <RefreshMarket /> : undefined}
      />

      {error && (
        <p role="alert" className="text-danger">
          Markets could not be loaded. If this is new, the database update may not be live yet.
        </p>
      )}

      {!row ? (
        <Empty title="No market figures yet" action={<RefreshMarket />}>
          They arrive with the morning run at 7:00 Lagos time, or read them now.
        </Empty>
      ) : (
        <>
          <section aria-labelledby="rates-h" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="rates-h" className="text-[22px] font-semibold tracking-[-0.015em]">
                Official exchange rates
              </h2>
              <p className="text-soft text-[14px] tabular-nums">
                CBN central rate, naira per unit, for {row.rates[0]?.date ?? row.day}. Read {when(row.updated_at)}.
              </p>
            </div>
            {row.rates.length ? (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {row.rates.map((r) => (
                  <div key={r.currency} className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] px-4 py-3.5 outline outline-1 -outline-offset-1 outline-white/[0.06]">
                    <dt className="text-soft text-[13px] font-medium">{CURRENCY_LABEL[r.currency] ?? r.currency}</dt>
                    <dd className="flex flex-col gap-1">
                      <span className="text-[24px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{naira(r.rate)}</span>
                      <span className="text-[13px] tabular-nums">
                        <Move pct={change(r.rate, r.dayBefore)} span="on the day" />
                      </span>
                      <span className="text-[13px] tabular-nums">
                        <Move pct={change(r.rate, r.monthAgo)} span="in 30 days" />
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-soft">The CBN did not answer this morning. Its own page is linked below.</p>
            )}
          </section>

          {row.brief && (
            <section aria-labelledby="brief-h" className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-5 outline outline-1 -outline-offset-1 outline-white/[0.06]">
              <h2 id="brief-h" className="text-[20px] font-semibold tracking-[-0.015em]">
                Today in plain words
              </h2>
              <div className="flex max-w-[44em] flex-col gap-1.5 text-[15px] leading-relaxed">
                {row.brief
                  .split(/\n+/)
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l, i) =>
                    /^(What moved|Why it matters|What to watch):?$/i.test(l) ? (
                      <h3 key={i} className="pt-2 text-[16px] font-semibold first:pt-0">
                        {l.replace(/:$/, "")}
                      </h3>
                    ) : (
                      <p key={i}>{l.replace(/^[-•]\s*/, "")}</p>
                    ),
                  )}
              </div>
              <p className="text-soft text-[13px]">
                Written by AI from the figures and headlines on this page ({row.brief_from}), and checked so it adds no number of its own. It is not financial advice.
              </p>
            </section>
          )}

          <section aria-labelledby="news-h" className="flex flex-col gap-4">
            <h2 id="news-h" className="text-[22px] font-semibold tracking-[-0.015em]">
              Market news <span className="text-soft tabular-nums">{row.news.length}</span>
            </h2>
            {row.news.length ? (
              <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.04] outline outline-1 -outline-offset-1 outline-white/[0.06]">
                {row.news.map((h) => (
                  <li key={h.url}>
                    <a href={h.url} target="_blank" rel="noreferrer" className="focus-visible:ring-ring flex flex-col gap-1 px-4 py-3 outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset">
                      <span className="text-[15px] leading-snug font-medium">{h.title}</span>
                      <span className="text-soft text-[13px] tabular-nums">
                        {h.source}
                        {h.at ? ` · ${when(h.at)}` : ""}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-soft">No market stories in today&rsquo;s feeds.</p>
            )}
            {row.errors.length > 0 && <p className="text-soft text-[13px]">Not read this time: {row.errors.join("; ")}.</p>}
          </section>
        </>
      )}

      <section aria-labelledby="src-h" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="src-h" className="text-[22px] font-semibold tracking-[-0.015em]">
            Where the numbers come from
          </h2>
          <p className="text-soft text-[14px]">The official sources, for T-bills, bonds, fund yields, results and pensions too.</p>
        </div>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {MARKET_SOURCES.map((s) => (
            <li key={s.name} className="flex flex-col gap-1 rounded-2xl bg-white/[0.04] p-4 outline outline-1 -outline-offset-1 outline-white/[0.06]">
              <p className="text-soft text-[13px] font-medium">{s.topic}</p>
              <a href={s.url} target="_blank" rel="noreferrer" className={`${LINK} self-start text-[15px] font-medium`}>
                {s.name}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <p className="text-soft text-[13px]">{s.how}</p>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
