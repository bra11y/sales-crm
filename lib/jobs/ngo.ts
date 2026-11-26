// NGO and UN jobs from ReliefWeb (run by UN OCHA). Its public jobs feed needs no key: 20 newest
// posts per search, each with the country, the organisation and the closing date.
// Devex and Impactpool block automated reading, so the NGO jobs page links to their searches.

import { decodeEntities, htmlToText } from "./text.ts";
import type { JobPost } from "./sources.ts";

export const RELIEFWEB_NIGERIA = "https://reliefweb.int/jobs/rss.xml?advanced-search=%28C175%29";
export const reliefwebSearch = (words: string) => `https://reliefweb.int/jobs/rss.xml?search=${encodeURIComponent(words.trim().slice(0, 100))}`;

// ReliefWeb's firewall turns away most server requests to its feed. Its API is the steady way in,
// with a free app name you ask ReliefWeb for (apidoc.reliefweb.int/#appname): set RELIEFWEB_APPNAME.
const API_FIELDS = ["title", "body-html", "url", "date.created", "date.closing", "source.name", "country.name", "career_categories.name", "type.name"];
export function reliefwebApi(appname: string, words: string | null): string {
  const p = new URLSearchParams({ appname, limit: "50", "sort[]": "date.created:desc", profile: "minimal" });
  for (const f of API_FIELDS) p.append("fields[include][]", f);
  if (words) p.set("query[value]", words.trim().slice(0, 100));
  else {
    p.set("filter[field]", "country.iso3");
    p.set("filter[value]", "nga");
  }
  return `https://api.reliefweb.int/v2/jobs?${p}`;
}

export function reliefwebUrls(appname: string | undefined, words: string[]): string[] {
  // With an app name the API comes first; the Nigeria feed stays as a backup in case the API
  // refuses (an app name ReliefWeb has not approved yet answers 403). Repeats are merged by job id.
  return appname ? [reliefwebApi(appname, null), ...words.map((w) => reliefwebApi(appname, w)), RELIEFWEB_NIGERIA] : [RELIEFWEB_NIGERIA, ...words.map(reliefwebSearch)];
}

type ApiJob = { id?: number | string; fields?: Record<string, unknown> };
const names = (v: unknown) => (Array.isArray(v) ? v.map((x) => String((x as { name?: unknown })?.name ?? "")).filter(Boolean) : []);

export function parseReliefWebApi(body: string, now = Date.now()): JobPost[] {
  const data = (JSON.parse(body) as { data?: ApiJob[] }).data ?? [];
  return data
    .map((d): JobPost | null => {
      const f = d.fields ?? {};
      const date = (f.date ?? {}) as { created?: string; closing?: string };
      const closes = date.closing ? date.closing.slice(0, 10) : null;
      if (closes && Date.parse(`${closes}T23:59:59Z`) < now) return null;
      const country = names(f.country)[0] ?? "";
      const description = htmlToText(String(f["body-html"] ?? f.body ?? "")).slice(0, 20_000);
      const title = String(f.title ?? "").trim();
      const link = String(f.url ?? `https://reliefweb.int/job/${d.id}`);
      if (!d.id || !title) return null;
      const remote = /\b(home[- ]based|remote(ly)?|work from home)\b/i.test(`${title} ${description.slice(0, 3000)}`);
      const kinds = names(f.type);
      return {
        source: "reliefweb",
        externalId: String(d.id),
        title,
        company: names(f.source)[0] ?? "",
        companyLogo: null,
        url: link,
        applyUrl: link,
        description: closes ? `Closing date: ${closes}\n\n${description}` : description,
        location: remote ? `Remote${country ? ` (${country})` : ""}` : country,
        restrictions: country && !remote ? [country] : [],
        pay: null,
        employmentType: kinds.join(", "),
        postedAt: date.created ?? null,
        tags: ["NGO", ...names(f.career_categories)],
      } satisfies JobPost;
    })
    .filter((j): j is JobPost => Boolean(j));
}

export const parseReliefWebAny = (body: string) => (body.trimStart().startsWith("{") ? parseReliefWebApi(body) : parseReliefWeb(body));

const tag = (item: string, name: string) => decodeEntities(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? "");
const iso = (v: string) => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

export function closingDate(text: string): string | null {
  const m = text.match(/Closing date:\s*(\d{1,2} \w+ \d{4})/i);
  if (!m) return null;
  const t = Date.parse(`${m[1]} 23:59 UTC`);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export function parseReliefWeb(body: string, now = Date.now()): JobPost[] {
  return [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]): JobPost | null => {
      const link = tag(item, "link") || tag(item, "guid");
      const id = link.match(/reliefweb\.int\/job\/(\d+)/)?.[1];
      if (!id) return null;
      const html = tag(item, "description");
      const country = html.match(/Country:\s*([^<]+)</)?.[1]?.trim() ?? "";
      const org = html.match(/Organization:\s*([^<]+)</)?.[1]?.trim() ?? tag(item, "author");
      const closes = closingDate(html);
      if (closes && Date.parse(`${closes}T23:59:59Z`) < now) return null;
      const description = htmlToText(html.replace(/<div class="(?:tag|date)[^"]*">[^<]*<\/div>/g, "")).slice(0, 20_000);
      const remote = /\b(home[- ]based|remote(ly)?|work from home)\b/i.test(`${tag(item, "title")} ${description.slice(0, 3000)}`);
      const categories = [...item.matchAll(/<category>([^<]*)<\/category>/g)].map((m) => decodeEntities(m[1]).trim()).filter((c) => c && c !== "Job" && c !== country && c !== org);
      return {
        source: "reliefweb",
        externalId: id,
        title: tag(item, "title").replace(/\s*_\s*/g, " - ").replace(/\s+/g, " ").trim(),
        company: org,
        companyLogo: null,
        url: link,
        applyUrl: link,
        description: closes ? `Closing date: ${closes}\n\n${description}` : description,
        location: remote ? `Remote${country ? ` (${country})` : ""}` : country,
        restrictions: country && !remote ? [country] : [],
        pay: null,
        employmentType: categories.includes("Consultancy") ? "Consultancy" : "",
        postedAt: iso(tag(item, "pubDate")),
        tags: ["NGO", ...categories],
      } satisfies JobPost;
    })
    .filter((j): j is JobPost => Boolean(j));
}

// Where to look by hand, with your job title already in the search.
export function ngoLinks(title: string) {
  const q = encodeURIComponent(title);
  return [
    { name: "ReliefWeb", url: `https://reliefweb.int/jobs?search=${q}`, note: "UN and NGO jobs, read here every day." },
    { name: "Devex", url: `https://www.devex.com/jobs/search?query=${q}`, note: "Development jobs. Some posts need a free account." },
    { name: "Impactpool", url: `https://www.impactpool.org/search?q=${q}`, note: "UN, World Bank and NGO jobs, with a free profile." },
    { name: "UN Careers", url: `https://careers.un.org/jobopening?language=en&keyword=${q}`, note: "The UN Secretariat's own vacancies." },
  ];
}
