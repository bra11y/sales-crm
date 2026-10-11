import type { Company } from "@/data/companies";

export type CompanyListRow = {
  id: string;
  product: string;
  name: string;
  stage: string | null;
  segment: string | null;
  owner_name: string | null;
  open_deals: number;
  pipeline_value_minor: number;
  currency: string;
  win_probability: number;
  last_interaction_at: string | null;
  last_interaction_label: string | null;
  trend: number[] | null;
};

const DAY = 86_400_000;

export function toCompany(row: CompanyListRow, now: Date): Company {
  const last = row.last_interaction_at;
  return {
    id: row.id,
    product: row.product,
    currency: row.currency,
    name: row.name,
    tags: [row.segment, row.stage].filter((tag): tag is string => Boolean(tag)),
    owner: row.owner_name ?? "Unassigned",
    openDeals: row.open_deals,
    pipelineValue: row.pipeline_value_minor / 100,
    winProbability: row.win_probability,
    trend: row.trend && row.trend.length === 14 ? row.trend : Array.from({ length: 14 }, () => 0),
    lastInteraction: last
      ? { date: last.slice(0, 10), label: row.last_interaction_label ?? "" }
      : { date: "", label: "No activity yet" },
    activityDays: last ? Math.max(0, Math.floor((now.getTime() - Date.parse(last)) / DAY)) : Number.MAX_SAFE_INTEGER,
  };
}
