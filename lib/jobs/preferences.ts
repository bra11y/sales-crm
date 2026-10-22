import { type Boards, SOURCE_IDS, type SourceId } from "./sources.ts";

export type Preferences = {
  minMonthlyUsd: number;
  remoteOnly: boolean;
  cities: string[];
  visa: boolean;
  searches: string[];
  boards: Boards;
  sources: SourceId[];
  // "on" lets a small AI model write the 'why this company' lines; "off" keeps everything free and rule-based.
  ai: "on" | "off";
};

export const DEFAULT_PREFERENCES: Preferences = {
  minMonthlyUsd: 2000,
  remoteOnly: true,
  cities: ["Abuja"],
  visa: true,
  searches: ["accessibility", "front end", "react", "shopify", "product designer", "ux designer"],
  boards: {
    greenhouse: ["vercel", "gitlab", "levelaccess", "automatticcareers"],
    ashby: ["supabase", "posthog", "resend", "linear"],
    lever: ["spotify"],
  },
  sources: SOURCE_IDS,
  ai: "on",
};

const words = (v: unknown, max: number) =>
  [...new Set((Array.isArray(v) ? v : String(v ?? "").split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean))]
    .map((s) => s.slice(0, 60))
    .slice(0, max);
const slugs = (v: unknown) => words(v, 30).map((s) => s.toLowerCase()).filter((s) => /^[a-z0-9._-]+$/.test(s));

export function cleanPreferences(input: unknown): Preferences {
  const p = (input ?? {}) as Partial<Record<keyof Preferences, unknown>>;
  const boards = (p.boards ?? {}) as Partial<Record<keyof Boards, unknown>>;
  const min = Number(p.minMonthlyUsd);
  const sources = Array.isArray(p.sources) ? SOURCE_IDS.filter((id) => (p.sources as unknown[]).includes(id)) : DEFAULT_PREFERENCES.sources;
  return {
    minMonthlyUsd: Number.isFinite(min) && min >= 0 ? Math.min(Math.round(min), 1_000_000) : DEFAULT_PREFERENCES.minMonthlyUsd,
    remoteOnly: p.remoteOnly === undefined ? DEFAULT_PREFERENCES.remoteOnly : Boolean(p.remoteOnly),
    cities: p.cities === undefined ? DEFAULT_PREFERENCES.cities : words(p.cities, 10),
    visa: p.visa === undefined ? DEFAULT_PREFERENCES.visa : Boolean(p.visa),
    searches: p.searches === undefined ? DEFAULT_PREFERENCES.searches : words(p.searches, 12),
    boards: {
      greenhouse: boards.greenhouse === undefined ? DEFAULT_PREFERENCES.boards.greenhouse : slugs(boards.greenhouse),
      ashby: boards.ashby === undefined ? DEFAULT_PREFERENCES.boards.ashby : slugs(boards.ashby),
      lever: boards.lever === undefined ? DEFAULT_PREFERENCES.boards.lever : slugs(boards.lever),
    },
    sources,
    ai: p.ai === "off" ? "off" : "on",
  };
}
