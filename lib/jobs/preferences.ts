import { cleanScholarshipPrefs, DEFAULT_SCHOLARSHIP_PREFS, type ScholarshipPrefs } from "../scholarships/fit.ts";
import { BIG_COMPANIES, type Boards, SOURCE_IDS, type SourceId } from "./sources.ts";

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
  // Sites whose jobs are hidden and never searched, such as ones that ask you to pay before you apply.
  blockedSites: string[];
  // What scholarships to look for: level, funding, places.
  scholarship: ScholarshipPrefs;
  // Also search the job boards of big companies (Stripe, OpenAI, Cloudflare and more).
  bigCompanies: boolean;
  // Off unless you turn it on: strong-fit jobs that take email, with nothing for you to answer,
  // are queued for you and held 2 hours in the Outbox so you can cancel any of them.
  autoApply: { on: boolean; perDay: number };
};

// Your own company list plus, when on, the big companies: each board asked once.
export function boardsFor(p: Preferences): Boards {
  if (!p.bigCompanies) return p.boards;
  const join = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  return { greenhouse: join(p.boards.greenhouse, BIG_COMPANIES.greenhouse), ashby: join(p.boards.ashby, BIG_COMPANIES.ashby), lever: join(p.boards.lever, BIG_COMPANIES.lever) };
}

// Himalayas asks you to sign up, upload your CV, then pay before you can apply.
export const DEFAULT_BLOCKED = ["himalayas.app"];

// "https://www.himalayas.app/jobs" or "himalayas.app" -> "himalayas.app".
export const siteOf = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#:].*$/, "");

export function blocked(url: string, sites: string[]): string | null {
  const host = siteOf(url);
  return sites.find((s) => host === s || host.endsWith(`.${s}`)) ?? null;
}

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
  blockedSites: DEFAULT_BLOCKED,
  scholarship: DEFAULT_SCHOLARSHIP_PREFS,
  bigCompanies: true,
  autoApply: { on: false, perDay: 5 },
};

const words = (v: unknown, max: number) => [...new Set((Array.isArray(v) ? v : String(v ?? "").split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean))].map((s) => s.slice(0, 60)).slice(0, max);
const slugs = (v: unknown) =>
  words(v, 30)
    .map((s) => s.toLowerCase())
    .filter((s) => /^[a-z0-9._-]+$/.test(s));

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
    blockedSites:
      p.blockedSites === undefined
        ? DEFAULT_BLOCKED
        : words(p.blockedSites, 30)
            .map(siteOf)
            .filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)),
    scholarship: cleanScholarshipPrefs(p.scholarship),
    bigCompanies: p.bigCompanies === undefined ? true : Boolean(p.bigCompanies),
    autoApply: (() => {
      const a = (p.autoApply ?? {}) as { on?: unknown; perDay?: unknown };
      const n = Number(a.perDay);
      return { on: a.on === true, perDay: Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : 5 };
    })(),
  };
}
