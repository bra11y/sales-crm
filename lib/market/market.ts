// Markets: the CBN's official exchange rates and Nigerian business news, saved once a day, with
// a plain brief of what moved. It explains; it never tells anyone what to buy or sell.

import { ask, type Provider } from "../apply/ai.ts";
import { decodeEntities, htmlToText } from "../jobs/text.ts";

type Fetcher = typeof fetch;
const UA = "SalesCRM-Market/1.0 (+https://sales-crm-virid-ten.vercel.app)";

export const CBN_RATES = "https://www.cbn.gov.ng/api/GetAllExchangeRates";
export const CURRENCIES = ["US DOLLAR", "POUNDS STERLING", "EURO", "YUAN/RENMINBI"] as const;
export const CURRENCY_LABEL: Record<string, string> = { "US DOLLAR": "US dollar", "POUNDS STERLING": "British pound", EURO: "Euro", "YUAN/RENMINBI": "Chinese yuan" };

export type Rate = { currency: string; date: string; rate: number; dayBefore: number | null; monthAgo: number | null };
export type Headline = { title: string; url: string; source: string; at: string | null };

type CbnRow = { currency?: string; ratedate?: string; centralrate?: string };

// The latest central rate for each currency, with the one before it and the one about 30 days back.
export function ratesFrom(rows: CbnRow[]): Rate[] {
  return CURRENCIES.map((c): Rate | null => {
    const mine = rows
      .filter((r) => String(r.currency ?? "").toUpperCase() === c && r.ratedate && Number(r.centralrate) > 0)
      .sort((a, b) => String(b.ratedate).localeCompare(String(a.ratedate)));
    if (!mine.length) return null;
    const date = String(mine[0].ratedate);
    const target = new Date(Date.parse(`${date}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
    const month = mine.find((r) => String(r.ratedate) <= target);
    return { currency: c, date, rate: Number(mine[0].centralrate), dayBefore: mine[1] ? Number(mine[1].centralrate) : null, monthAgo: month ? Number(month.centralrate) : null };
  }).filter((r): r is Rate => Boolean(r));
}

export const NEWS_FEEDS = [
  { source: "Premium Times", url: "https://www.premiumtimesng.com/category/business/feed" },
  { source: "Punch", url: "https://punchng.com/topics/business/feed/" },
  { source: "BusinessDay", url: "https://businessday.ng/feed/" },
];

// Market stories only: the naira, rates, inflation, stocks, bonds, oil and the like.
const MARKET = /\b(naira|cbn|central bank|exchange rate|forex|fx|dollar|inflation|cpi|interest rate|mpr|monetary policy|t-?bills?|treasury|bonds?|dmo|ngx|stock|equities|shares|dividend|market cap|fmdq|commercial paper|pencom|pension|oil price|brent|crude|nbs|gdp|yield|money market|sec\b|eurobond|reserves)\b/i;

export function headlinesFrom(xml: string, source: string): Headline[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const tag = (n: string) => decodeEntities((item.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`))?.[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
      const title = htmlToText(tag("title")).trim();
      const url = tag("link");
      const t = Date.parse(tag("pubDate"));
      return { title, url, source, at: Number.isNaN(t) ? null : new Date(t).toISOString() };
    })
    .filter((h) => h.title && /^https:\/\//.test(h.url) && MARKET.test(h.title));
}

export async function readRates(fetcher: Fetcher = fetch): Promise<Rate[]> {
  const res = await fetcher(CBN_RATES, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(60_000), cache: "no-store" });
  if (!res.ok) throw new Error(`CBN answered ${res.status}`);
  return ratesFrom((await res.json()) as CbnRow[]);
}

export async function readNews(fetcher: Fetcher = fetch): Promise<{ news: Headline[]; errors: string[] }> {
  const errors: string[] = [];
  const all = await Promise.all(
    NEWS_FEEDS.map(async (f) => {
      try {
        const res = await fetcher(f.url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        return headlinesFrom(await res.text(), f.source);
      } catch (e) {
        errors.push(`${f.source}: ${e instanceof Error ? e.message : "no answer"}`);
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const news = all
    .flat()
    .filter((h) => !seen.has(h.title.toLowerCase()) && seen.add(h.title.toLowerCase()))
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 20);
  return { news, errors };
}

const pct = (now: number, then: number | null) => (then ? ((now - then) / then) * 100 : null);

// Lines the brief is built from: figures as facts, so the model only explains them.
export function factsFor(rates: Rate[], news: Headline[]): string {
  // The direction is spelled out: a lower naira figure is a stronger naira, which models get backwards.
  const moved = (now: number, then: number | null, span: string) => {
    const p = pct(now, then);
    if (p === null) return "";
    if (Math.abs(p) < 0.005) return `, naira flat ${span}`;
    return `, naira ${p > 0 ? "weaker" : "stronger"} by ${Math.abs(p).toFixed(2)}% ${span}`;
  };
  const r = rates.map((x) => `${CURRENCY_LABEL[x.currency]}: ₦${x.rate.toFixed(2)} per unit on ${x.date}${moved(x.rate, x.dayBefore, "on the day")}${moved(x.rate, x.monthAgo, "over 30 days")}`);
  return ["Official CBN rates:", ...r, "", "Headlines:", ...news.slice(0, 12).map((h) => `- ${h.title} (${h.source})`)].join("\n");
}

export const BRIEF_SYSTEM = [
  "You write a short daily market brief for a Nigerian reader who is not a finance expert.",
  "Use only the figures and headlines given. Never invent a number, a rate or an event.",
  "Write three short parts with these exact headings on their own lines: What moved, Why it matters, What to watch.",
  "Say whether the naira was stronger or weaker exactly as the figures state it.",
  "What to watch: upcoming events or figures worth following (a CBN meeting, an inflation release, an auction), as things to watch, not actions.",
  "Never tell the reader to buy, sell, hold, invest, move money or 'position'. No predictions of prices. No 'you should'.",
  "Plain English, short sentences, under 180 words. No em dashes. No bold.",
].join("\n");

const ADVICE = /\b(you should|we recommend|buy|sell|go long|go short|position yourself|move your money|invest in|hold onto|target price)\b/i;

export async function writeBrief(rates: Rate[], news: Headline[], providers: Provider[], fetcher: Fetcher = fetch): Promise<{ brief: string; from: string } | null> {
  if (!rates.length && !news.length) return null;
  for (const p of providers) {
    try {
      const out = (await ask(p, BRIEF_SYSTEM, factsFor(rates, news), fetcher, 500, 0.3)).replace(/\*\*/g, "").replace(/\s[–—]\s/g, ", ").trim();
      const facts = factsFor(rates, news).replace(/,(?=\d{3})/g, "");
      const numbers = (out.match(/\d[\d.,]*%?/g) ?? []).map((n) => n.replace(/[.,]+$/, "").replace(/,(?=\d{3})/g, ""));
      if (!out || ADVICE.test(out) || numbers.some((n) => !facts.includes(n))) continue;
      return { brief: out.slice(0, 3000), from: `${p.name} · ${p.model}` };
    } catch {
      continue;
    }
  }
  return null;
}

// Where every figure comes from, for checking or going deeper.
export const MARKET_SOURCES = [
  { topic: "Exchange rate", name: "CBN official rates", url: "https://www.cbn.gov.ng/rates/ExchRateByCurrency.html", how: "Every working day" },
  { topic: "Inflation", name: "NBS monthly CPI report", url: "https://nigerianstat.gov.ng", how: "Monthly, mid-month" },
  { topic: "T-bills", name: "CBN auction results", url: "https://www.cbn.gov.ng", how: "After each auction, about every two weeks" },
  { topic: "Bonds and savings bonds", name: "DMO offers", url: "https://www.dmo.gov.ng", how: "Monthly" },
  { topic: "Money market funds", name: "SEC weekly fund report", url: "https://sec.gov.ng", how: "Weekly" },
  { topic: "Money market funds", name: "Afriradar tables", url: "https://www.afriradar.com/money-market-funds", how: "Weekly, easier to read" },
  { topic: "Company results and dividends", name: "NGX disclosures", url: "https://ngxgroup.com", how: "As companies file" },
  { topic: "Commercial papers and bond prices", name: "FMDQ", url: "https://fmdqgroup.com", how: "Daily" },
  { topic: "Pensions", name: "PenCom monthly reports", url: "https://www.pencom.gov.ng", how: "Monthly" },
];

type Db = { from: (t: string) => { upsert: (row: Record<string, unknown>, o?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> } };

// The daily job: read, explain, save today's row. A source that fails is noted, never fatal.
export async function refreshMarket(db: Db, providers: Provider[], fetcher: Fetcher = fetch, now = new Date()) {
  const errors: string[] = [];
  const rates = await readRates(fetcher).catch((e) => {
    errors.push(`CBN: ${e instanceof Error ? e.message : "no answer"}`);
    return [] as Rate[];
  });
  const { news, errors: newsErrors } = await readNews(fetcher);
  errors.push(...newsErrors);
  const brief = await writeBrief(rates, news, providers, fetcher);
  const day = new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10);
  const { error } = await db.from("market_daily").upsert({ day, rates, news, brief: brief?.brief ?? null, brief_from: brief?.from ?? null, errors, updated_at: now.toISOString() }, { onConflict: "day" });
  return { ok: !error, day, rates: rates.length, news: news.length, brief: Boolean(brief), errors: error ? [...errors, error.message] : errors };
}
