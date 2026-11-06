// Your own bills and subscriptions: when each is due, what this month costs, and what is left
// of your income. Amounts in different currencies are never added together: each currency
// keeps its own totals, because a made-up exchange rate would give a wrong number.

export const CYCLES = ["week", "month", "quarter", "year", "once"] as const;
export type Cycle = (typeof CYCLES)[number];
export const CYCLE_LABEL: Record<Cycle, string> = { week: "Every week", month: "Every month", quarter: "Every 3 months", year: "Every year", once: "One time" };

export const CATEGORIES = ["subscription", "bill", "rent", "loan", "insurance", "savings", "family", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  subscription: "Subscription",
  bill: "Bill (power, internet, phone)",
  rent: "Rent",
  loan: "Loan or debt",
  insurance: "Insurance or health",
  savings: "Savings or investment",
  family: "Family and support",
  other: "Other",
};

export const STATUSES = ["active", "paused", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];

export const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR", "CAD"] as const;

export type Bill = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  cycle: Cycle;
  next_due: string;
  category: Category;
  method: string | null;
  url: string | null;
  note: string | null;
  status: Status;
  created_at?: string;
};
export type Payment = { id: string; bill_id: string; paid_on: string; amount: number; currency: string };

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T00:00:00Z`);

// The next due date after one is paid. Month steps keep the day of the month, and fall back to
// the month's last day (a bill due on the 31st is due on 30 April, then 31 May).
export function nextDue(due: string, cycle: Cycle, anchorDay?: number): string | null {
  if (cycle === "once") return null;
  const d = at(due);
  if (cycle === "week") return iso(new Date(d.getTime() + 7 * DAY));
  const months = cycle === "month" ? 1 : cycle === "quarter" ? 3 : 12;
  const day = anchorDay ?? d.getUTCDate();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(day, last))));
}

// Every date a bill falls due from `from` to `to` (inclusive), starting at its next due date.
export function dueDates(b: Pick<Bill, "next_due" | "cycle" | "status">, from: string, to: string): string[] {
  if (b.status !== "active") return [];
  const out: string[] = [];
  const anchor = at(b.next_due).getUTCDate();
  let d: string | null = b.next_due;
  for (let i = 0; d && d <= to && i < 60; i++) {
    if (d >= from) out.push(d);
    d = nextDue(d, b.cycle, anchor);
  }
  return out;
}

// What one bill costs a month and a year, on average.
export function perMonth(b: Pick<Bill, "amount" | "cycle">): number {
  return { week: (b.amount * 52) / 12, month: b.amount, quarter: b.amount / 3, year: b.amount / 12, once: 0 }[b.cycle];
}
export const perYear = (b: Pick<Bill, "amount" | "cycle">) => (b.cycle === "once" ? b.amount : Math.round(perMonth(b) * 12 * 100) / 100);

export const monthOf = (d: Date) => ({ start: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), end: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) });

export type MonthTotals = { currency: string; due: number; paid: number; left: number; yearly: number; count: number };

// This month, per currency: what falls due (paid or not), what you paid, and what is left.
// A bill already paid this month has moved its next date on, so its payment is counted too.
export function monthTotals(bills: Bill[], payments: Payment[], now = new Date()): MonthTotals[] {
  const { start, end } = monthOf(now);
  const by = new Map<string, MonthTotals>();
  const get = (c: string) => by.get(c) ?? by.set(c, { currency: c, due: 0, paid: 0, left: 0, yearly: 0, count: 0 }).get(c)!;
  for (const b of bills) {
    if (b.status !== "active") continue;
    const t = get(b.currency);
    const upcoming = dueDates(b, start, end).length * b.amount;
    t.left += upcoming;
    t.yearly += perYear(b);
    t.count++;
  }
  for (const p of payments) {
    if (p.paid_on < start || p.paid_on > end) continue;
    get(p.currency).paid += p.amount;
  }
  for (const t of by.values()) {
    t.due = t.left + t.paid;
    for (const k of ["due", "paid", "left", "yearly"] as const) t[k] = Math.round(t[k] * 100) / 100;
  }
  return [...by.values()].sort((a, b) => b.due - a.due);
}

export type Upcoming = { bill: Bill; date: string; days: number };

// Bills due in the next `days` days, soonest first. Late ones (date already passed) come first.
export function upcoming(bills: Bill[], days = 14, now = new Date()): Upcoming[] {
  const today = iso(now);
  const to = iso(new Date(now.getTime() + days * DAY));
  return bills
    .filter((b) => b.status === "active" && b.next_due <= to)
    .map((b) => ({ bill: b, date: b.next_due, days: Math.round((at(b.next_due).getTime() - at(today).getTime()) / DAY) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.bill.name.localeCompare(b.bill.name));
}

export function dueLabel(days: number): string {
  if (days < -1) return `${-days} days late`;
  if (days === -1) return "1 day late";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

const SYMBOL: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "GH₵", KES: "KSh ", ZAR: "R", CAD: "CA$" };
export function money(amount: number, currency: string): string {
  const n = Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}${SYMBOL[currency] ?? `${currency} `}${n}`;
}

// What is left of a monthly income after this month's bills and the savings target.
export function budget(income: number, currency: string, totals: MonthTotals[], savePercent: number): { bills: number; save: number; left: number } | null {
  if (!income || income <= 0) return null;
  const t = totals.find((x) => x.currency === currency);
  const bills = t?.due ?? 0;
  const save = Math.round(income * (Math.min(Math.max(savePercent, 0), 90) / 100));
  return { bills, save, left: Math.round((income - bills - save) * 100) / 100 };
}

// Clean, safe input from the form.
export function cleanBill(input: Record<string, unknown>): { ok: true; bill: Omit<Bill, "id"> } | { ok: false; field: string; error: string } {
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, field: "name", error: "Give it a name, like Netflix or Rent." };
  const amount = Number(String(input.amount ?? "").replace(/[,\s₦$£€]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, field: "amount", error: "Enter the amount as a number, like 4500." };
  if (amount > 1e11) return { ok: false, field: "amount", error: "That amount is too large." };
  const currency = String(input.currency ?? "NGN").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, field: "currency", error: "Pick a currency." };
  const cycle = CYCLES.includes(input.cycle as Cycle) ? (input.cycle as Cycle) : "month";
  const next_due = String(input.next_due ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next_due) || Number.isNaN(at(next_due).getTime())) return { ok: false, field: "next_due", error: "Pick the date it is next due." };
  const category = CATEGORIES.includes(input.category as Category) ? (input.category as Category) : "other";
  const status = STATUSES.includes(input.status as Status) ? (input.status as Status) : "active";
  let url: string | null = String(input.url ?? "").trim() || null;
  if (url) {
    try {
      const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      url = u.protocol === "https:" ? u.toString().slice(0, 500) : null;
    } catch {
      return { ok: false, field: "url", error: "That link is not a web address. Leave it empty or paste the full address." };
    }
  }
  return {
    ok: true,
    bill: { name, amount: Math.round(amount * 100) / 100, currency, cycle, next_due, category, method: String(input.method ?? "").trim().slice(0, 80) || null, url, note: String(input.note ?? "").trim().slice(0, 500) || null, status },
  };
}
