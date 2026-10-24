import { decodeEntities, htmlToText, type Pay, parsePay } from "./text.ts";

export type JobPost = {
  source: string;
  externalId: string;
  title: string;
  company: string;
  companyLogo: string | null;
  url: string;
  applyUrl: string;
  description: string;
  location: string;
  restrictions: string[];
  pay: Pay | null;
  employmentType: string;
  postedAt: string | null;
  tags: string[];
};

export type Boards = { greenhouse: string[]; ashby: string[]; lever: string[] };
export type SourceQuery = { searches: string[]; boards: Boards };

type Source = {
  name: string;
  home: string;
  minHoursBetween: number;
  urls: (q: SourceQuery) => string[];
  parse: (body: string, url: string) => JobPost[];
};

const MAX_TEXT = 20_000;
const iso = (v: unknown) => {
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v ?? ""));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const text = (html: unknown) => htmlToText(String(html ?? "")).slice(0, MAX_TEXT);
const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []);
const splitPlaces = (s: string) => s.split(/\s*[,;/|]\s*/).map((p) => p.trim()).filter(Boolean);
const boardSlug = (url: string, marker: string) => url.split(marker)[1]?.split(/[/?]/)[0] ?? "";
const titleCase = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function payFrom(min: unknown, max: unknown, currency: unknown, period: unknown): Pay | null {
  const lo = Number(min) || 0;
  const hi = Number(max) || lo;
  if (!lo && !hi) return null;
  const p = String(period ?? "year").toLowerCase();
  return {
    min: lo || hi,
    max: hi,
    currency: String(currency || "USD").toUpperCase(),
    period: p.startsWith("hour") ? "hour" : p.startsWith("month") ? "month" : p.startsWith("week") ? "week" : p.startsWith("day") ? "day" : "year",
  };
}

// Accessibility companies, always searched: their roles rarely reach the general boards.
export const ACCESSIBILITY_BOARDS = { greenhouse: ["levelaccess", "audioeye", "accessibe"] };

export type SourceId = "remotive" | "remoteok" | "himalayas" | "jobicy" | "weworkremotely" | "arbeitnow" | "greenhouse" | "ashby" | "lever";

export const SOURCES: Record<SourceId, Source> = {
  remotive: {
    name: "Remotive",
    home: "https://remotive.com",
    minHoursBetween: 6,
    urls: () => ["software-dev", "design"].map((c) => `https://remotive.com/api/remote-jobs?category=${c}&limit=100`),
    parse: (body) =>
      (JSON.parse(body).jobs ?? []).map((j: Record<string, unknown>) => ({
        source: "remotive",
        externalId: String(j.id),
        title: String(j.title ?? ""),
        company: String(j.company_name ?? ""),
        companyLogo: (j.company_logo as string) || null,
        url: String(j.url),
        applyUrl: String(j.url),
        description: text(j.description),
        location: String(j.candidate_required_location ?? ""),
        restrictions: splitPlaces(String(j.candidate_required_location ?? "")),
        pay: parsePay(j.salary as string),
        employmentType: String(j.job_type ?? "").replace(/_/g, " "),
        postedAt: iso(j.publication_date),
        tags: list(j.tags),
      })),
  },
  remoteok: {
    name: "Remote OK",
    home: "https://remoteok.com",
    minHoursBetween: 3,
    urls: () => ["https://remoteok.com/api"],
    parse: (body) =>
      (JSON.parse(body) as Record<string, unknown>[])
        .filter((j) => j.id && j.position)
        .map((j) => ({
          source: "remoteok",
          externalId: String(j.id),
          title: decodeEntities(String(j.position)),
          company: decodeEntities(String(j.company ?? "")),
          companyLogo: (j.company_logo as string) || (j.logo as string) || null,
          url: String(j.url),
          applyUrl: String(j.apply_url || j.url),
          description: text(j.description),
          location: String(j.location ?? ""),
          restrictions: splitPlaces(String(j.location ?? "")).filter((p) => !/^remote$/i.test(p)),
          pay: payFrom(j.salary_min, j.salary_max, "USD", "year"),
          employmentType: "",
          postedAt: iso(j.date ?? j.epoch),
          tags: list(j.tags),
        })),
  },
  himalayas: {
    name: "Himalayas",
    home: "https://himalayas.app",
    minHoursBetween: 3,
    // Two pages of 20 per search: niche searches like "accessibility" have hundreds of results.
    urls: (q) => q.searches.flatMap((s) => [1, 2].map((page) => `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(s)}&limit=20&page=${page}`)),
    parse: (body) =>
      (JSON.parse(body).jobs ?? []).map((j: Record<string, unknown>) => ({
        source: "himalayas",
        externalId: String(j.guid ?? j.applicationLink),
        title: String(j.title ?? ""),
        company: String(j.companyName ?? ""),
        companyLogo: (j.companyLogo as string) || null,
        url: String(j.guid ?? j.applicationLink),
        applyUrl: String(j.applicationLink ?? j.guid),
        description: text(j.description ?? j.excerpt),
        location: list(j.locationRestrictions).join(", ") || "Anywhere",
        restrictions: list(j.locationRestrictions),
        pay: payFrom(j.minSalary, j.maxSalary, j.currency, j.salaryPeriod),
        employmentType: String(j.employmentType ?? ""),
        postedAt: iso(j.pubDate),
        tags: list(j.categories).map((c) => c.replace(/-/g, " ")),
      })),
  },
  jobicy: {
    name: "Jobicy",
    home: "https://jobicy.com",
    minHoursBetween: 3,
    urls: (q) => q.searches.map((s) => `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(s)}`),
    parse: (body) =>
      (JSON.parse(body).jobs ?? []).map((j: Record<string, unknown>) => ({
        source: "jobicy",
        externalId: String(j.id),
        title: decodeEntities(String(j.jobTitle ?? "")),
        company: decodeEntities(String(j.companyName ?? "")),
        companyLogo: (j.companyLogo as string) || null,
        url: String(j.url),
        applyUrl: String(j.url),
        description: text(j.jobDescription ?? j.jobExcerpt),
        location: String(j.jobGeo ?? ""),
        restrictions: splitPlaces(String(j.jobGeo ?? "")).filter((p) => !/^anywhere$/i.test(p)),
        pay: payFrom(j.salaryMin ?? j.annualSalaryMin, j.salaryMax ?? j.annualSalaryMax, j.salaryCurrency, j.salaryPeriod),
        employmentType: list(j.jobType).join(", "),
        postedAt: iso(j.pubDate),
        tags: list(j.jobIndustry),
      })),
  },
  weworkremotely: {
    name: "We Work Remotely",
    home: "https://weworkremotely.com",
    minHoursBetween: 3,
    urls: () =>
      ["remote-front-end-programming-jobs", "remote-full-stack-programming-jobs", "remote-design-jobs"].map(
        (c) => `https://weworkremotely.com/categories/${c}.rss`,
      ),
    parse: (body) =>
      [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
        const tag = (name: string) => decodeEntities(item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? "");
        const [company, ...rest] = tag("title").split(": ");
        const region = tag("region");
        const link = tag("link") || tag("guid");
        return {
          source: "weworkremotely",
          externalId: link,
          title: rest.join(": ") || company,
          company: rest.length ? company : "",
          companyLogo: null,
          url: link,
          applyUrl: link,
          description: text(tag("description")),
          location: region,
          restrictions: /anywhere/i.test(region) ? [] : splitPlaces(region),
          pay: null,
          employmentType: tag("type"),
          postedAt: iso(tag("pubDate")),
          tags: [tag("category")].filter(Boolean),
        } satisfies JobPost;
      }),
  },
  arbeitnow: {
    name: "Arbeitnow",
    home: "https://www.arbeitnow.com",
    minHoursBetween: 3,
    urls: () => ["https://www.arbeitnow.com/api/job-board-api"],
    parse: (body) =>
      (JSON.parse(body).data ?? [])
        .filter((j: Record<string, unknown>) => j.remote === true)
        .map((j: Record<string, unknown>) => ({
          source: "arbeitnow",
          externalId: String(j.slug),
          title: String(j.title ?? ""),
          company: String(j.company_name ?? ""),
          companyLogo: null,
          url: String(j.url),
          applyUrl: String(j.url),
          description: text(j.description),
          location: String(j.location ?? ""),
          restrictions: [String(j.location ?? "")].filter(Boolean),
          pay: null,
          employmentType: list(j.job_types).join(", "),
          postedAt: iso(j.created_at),
          tags: list(j.tags),
        })),
  },
  greenhouse: {
    name: "Greenhouse",
    home: "https://www.greenhouse.com",
    minHoursBetween: 3,
    urls: (q) => [...new Set([...q.boards.greenhouse, ...ACCESSIBILITY_BOARDS.greenhouse])].map((b) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b)}/jobs?content=true`),
    parse: (body, url) =>
      (JSON.parse(body).jobs ?? []).map((j: Record<string, unknown>) => {
        const description = text(j.content);
        const location = String((j.location as { name?: string })?.name ?? "");
        return {
          source: "greenhouse",
          externalId: String(j.id),
          title: String(j.title ?? ""),
          company: String(j.company_name || titleCase(boardSlug(url, "/boards/"))),
          companyLogo: null,
          url: String(j.absolute_url),
          applyUrl: String(j.absolute_url),
          description,
          location,
          restrictions: splitPlaces(location.replace(/^(remote|hybrid)\s*[-–(]\s*/i, "").replace(/\)$/, "")),
          pay: parsePay(description.match(/[$€£]\s?\d[\d,.]*k?\s*(?:-|–|to)\s*[$€£]?\s?\d[\d,.]*k?[^.\n]{0,30}/i)?.[0]),
          employmentType: "",
          postedAt: iso(j.first_published ?? j.updated_at),
          tags: ((j.departments as { name: string }[]) ?? []).map((d) => d.name),
        } satisfies JobPost;
      }),
  },
  ashby: {
    name: "Ashby",
    home: "https://www.ashbyhq.com",
    minHoursBetween: 3,
    urls: (q) => q.boards.ashby.map((b) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b)}?includeCompensation=true`),
    parse: (body, url) =>
      (JSON.parse(body).jobs ?? [])
        .filter((j: Record<string, unknown>) => j.isListed !== false)
        .map((j: Record<string, unknown>) => {
          const location = [j.location, ...((j.secondaryLocations as { location: string }[]) ?? []).map((l) => l.location)].filter(Boolean).join(", ");
          const comp = j.compensation as { compensationTierSummary?: string | null; scrapeableCompensationSalarySummary?: string | null } | undefined;
          return {
            source: "ashby",
            externalId: String(j.id),
            title: String(j.title ?? ""),
            company: titleCase(boardSlug(url, "/job-board/")),
            companyLogo: null,
            url: String(j.jobUrl),
            applyUrl: String(j.applyUrl ?? j.jobUrl),
            description: String(j.descriptionPlain ?? "").slice(0, MAX_TEXT) || text(j.descriptionHtml),
            location: location + (j.isRemote ? " (remote)" : ""),
            restrictions: splitPlaces(location),
            pay: parsePay(comp?.scrapeableCompensationSalarySummary ?? comp?.compensationTierSummary),
            employmentType: String(j.employmentType ?? "").replace(/([a-z])([A-Z])/g, "$1 $2"),
            postedAt: iso(j.publishedAt),
            tags: [j.department, j.team].filter(Boolean).map(String),
          } satisfies JobPost;
        }),
  },
  lever: {
    name: "Lever",
    home: "https://www.lever.co",
    minHoursBetween: 3,
    urls: (q) => q.boards.lever.map((b) => `https://api.lever.co/v0/postings/${encodeURIComponent(b)}?mode=json`),
    parse: (body, url) =>
      (JSON.parse(body) as Record<string, unknown>[]).map((j) => {
        const cat = (j.categories ?? {}) as { location?: string; allLocations?: string[]; commitment?: string; team?: string };
        const range = j.salaryRange as { min?: number; max?: number; currency?: string; interval?: string } | undefined;
        const places = cat.allLocations?.length ? cat.allLocations : [cat.location].filter(Boolean) as string[];
        return {
          source: "lever",
          externalId: String(j.id),
          title: String(j.text ?? ""),
          company: titleCase(boardSlug(url, "/postings/")),
          companyLogo: null,
          url: String(j.hostedUrl),
          applyUrl: String(j.applyUrl ?? j.hostedUrl),
          description: String(j.descriptionPlain ?? "").slice(0, MAX_TEXT) || text(j.descriptionBody ?? j.description),
          location: places.join(", ") + (j.workplaceType === "remote" ? " (remote)" : ""),
          restrictions: places.filter((p) => !/^remote$/i.test(p)),
          pay: range ? payFrom(range.min, range.max, range.currency, String(range.interval ?? "").replace("per-", "")) : null,
          employmentType: String(cat.commitment ?? ""),
          postedAt: iso(j.createdAt),
          tags: [cat.team].filter(Boolean) as string[],
        } satisfies JobPost;
      }),
  },
};
export const SOURCE_IDS = Object.keys(SOURCES) as SourceId[];
