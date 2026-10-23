// One timeline for everything that happened: money in and out, pipeline moves,
// job applications, emails and notes. Pure, so pages and tests share it.

export type HistoryKind = "money" | "pipeline" | "application" | "email" | "note";

export const KIND_LABEL: Record<HistoryKind, string> = {
  money: "Money",
  pipeline: "Pipeline",
  application: "Applications",
  email: "Emails",
  note: "Notes",
};

export type HistoryItem = {
  id: string;
  at: string;
  kind: HistoryKind;
  title: string;
  detail?: string;
  companyId?: string;
  companyName?: string;
  product?: string;
  amountMinor?: number;
  currency?: string;
  failed?: boolean;
};

export function kindOf(activityKind: string): HistoryKind {
  if (activityKind.startsWith("payment.")) return "money";
  if (activityKind === "application.sent") return "application";
  if (activityKind === "note") return "note";
  return "pipeline";
}

const DAY = 86_400_000;

export function dayLabel(day: string, now: Date): string {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - DAY).toISOString().slice(0, 10);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  const d = new Date(`${day}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export type HistoryDay = { day: string; label: string; items: HistoryItem[]; paid: Record<string, number> };

// Newest day first; inside a day, newest first. `paid` adds up money in, per currency, never across.
export function byDay(items: HistoryItem[], now: Date): HistoryDay[] {
  const sorted = [...items].sort((a, b) => b.at.localeCompare(a.at));
  const days: HistoryDay[] = [];
  for (const item of sorted) {
    const day = item.at.slice(0, 10);
    let group = days.at(-1);
    if (!group || group.day !== day) {
      group = { day, label: dayLabel(day, now), items: [], paid: {} };
      days.push(group);
    }
    group.items.push(item);
    if (item.kind === "money" && !item.failed && item.amountMinor && item.currency) {
      group.paid[item.currency] = (group.paid[item.currency] ?? 0) + item.amountMinor;
    }
  }
  return days;
}

const cell = (v: string | number | undefined) => {
  const s = v === undefined ? "" : String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
};

export function historyCsv(items: HistoryItem[]): string {
  const head = ["Date", "Type", "What happened", "Company", "Amount", "Currency", "Status"];
  const rows = items.map((i) => [
    i.at,
    KIND_LABEL[i.kind],
    i.detail ? `${i.title}. ${i.detail}` : i.title,
    i.companyName,
    i.amountMinor === undefined ? undefined : (i.amountMinor / 100).toFixed(2),
    i.currency,
    i.kind === "money" ? (i.failed ? "Failed" : "Paid") : undefined,
  ]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
