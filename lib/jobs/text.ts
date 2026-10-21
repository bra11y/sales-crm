const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", hellip: "..." };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? m;
  });
}

export function htmlToText(html: string): string {
  let s = html;
  for (let i = 0; i < 2 && /&lt;|&gt;/.test(s); i++) s = decodeEntities(s);
  return decodeEntities(
    s
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/ul|\/ol)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type Pay = { min: number; max: number; currency: string; period: "hour" | "day" | "week" | "month" | "year" };

const USD_PER: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, CAD: 0.73, AUD: 0.66, NZD: 0.6, CHF: 1.13, SGD: 0.75, INR: 0.012, NGN: 0.00065, ZAR: 0.055, BRL: 0.18, PLN: 0.25, SEK: 0.095, NOK: 0.093, DKK: 0.145 };
const SYMBOL: [RegExp, string][] = [[/€|\beur\b/i, "EUR"], [/£|\bgbp\b/i, "GBP"], [/₦|\bngn\b|\bnaira\b/i, "NGN"], [/\bcad\b|c\$/i, "CAD"], [/\baud\b|a\$/i, "AUD"], [/₹|\binr\b/i, "INR"], [/\bchf\b/i, "CHF"], [/\bpln\b|zł/i, "PLN"]];
const PER_MONTH = { hour: 160, day: 21, week: 4.33, month: 1, year: 1 / 12 };

function num(raw: string, k: boolean): number {
  const grouped = /^\d{1,3}([.,]\d{3})+$/.test(raw);
  const decimalComma = !grouped && /^\d+,\d{1,2}$/.test(raw);
  const n = Number(grouped ? raw.replace(/[.,]/g, "") : decimalComma ? raw.replace(",", ".") : raw);
  return k ? n * 1000 : n;
}

export function parsePay(text: string | null | undefined): Pay | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/per (task|project|article|word|piece)|\/task/.test(t)) return null;
  const nums = [...t.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)\s*(k)?\b/g)]
    .map((m) => num(m[1], Boolean(m[2])))
    .filter((n) => n >= 5);
  if (!nums.length) return null;
  const min = Math.min(nums[0], nums[1] ?? nums[0]);
  const max = Math.max(nums[0], nums[1] ?? nums[0]);
  const currency = SYMBOL.find(([re]) => re.test(text))?.[1] ?? "USD";
  const period: Pay["period"] = /hour|\bhr\b|\/h\b/.test(t) ? "hour"
    : /\bday\b|daily/.test(t) ? "day"
    : /week/.test(t) ? "week"
    : /month|\bmo\b|\/m\b/.test(t) ? "month"
    : /year|annual|\byr\b|p\.?a\.?\b/.test(t) || min >= 15_000 ? "year"
    : min <= 300 ? "hour" : "month";
  return { min, max, currency, period };
}

export function monthlyUsd(pay: Pay | null): number | null {
  if (!pay) return null;
  const rate = USD_PER[pay.currency.toUpperCase()];
  if (!rate) return null;
  return Math.round(pay.min * PER_MONTH[pay.period] * rate);
}

export function payLabel(pay: Pay | null): string {
  if (!pay) return "";
  const f = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US"));
  const symbol = { USD: "$", EUR: "€", GBP: "£", NGN: "₦" }[pay.currency] ?? `${pay.currency} `;
  const range = pay.max > pay.min ? `${symbol}${f(pay.min)} - ${symbol}${f(pay.max)}` : `${symbol}${f(pay.min)}`;
  return `${range} a ${pay.period}`;
}
