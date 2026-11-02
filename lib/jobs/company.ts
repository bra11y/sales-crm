import type { HiringLookup } from "../mail/hiring.ts";
import { decodeEntities } from "./text.ts";
import { USER_AGENT } from "./run.ts";

export type CompanyInfo = {
  name: string;
  domain: string | null;
  website: string | null;
  summary: string;
  logo: string | null;
  links: { label: string; href: string }[];
  checkedAt: string;
  // The last search of their website for a hiring email, so it is not repeated every time.
  hiring?: HiringLookup;
};

const BOARD_HOSTS =
  /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|remotive\.com|remoteok\.com|himalayas\.app|jobicy\.com|weworkremotely\.com|arbeitnow\.com|workable\.com|linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|seek\.[a-z.]+|hotnigerianjobs\.com|myjobmag\.com|jobberman\.com|myworkdayjobs\.com|workday\.com|smartrecruiters\.com|bamboohr\.com|recruitee\.com|teamtailor\.com|jobvite\.com|icims\.com|breezy\.hr|wellfound\.com|otta\.com|welcometothejungle\.com|jobgether\.com|workingnomads\.com|ziprecruiter\.com|google\.com|forms\.gle|typeform\.com|tally\.so|notion\.site|jotform\.com|rippling\.com|personio\.[a-z]+|pinpointhq\.com|dover\.com|gem\.com|jazzhr\.com|applytojob\.com|paylocity\.com|ultipro\.com|adp\.com|taleo\.net|successfactors\.com|oraclecloud\.com)$/i;

export function safeDomain(host: string | null | undefined): string | null {
  const h = String(host ?? "")
    .toLowerCase()
    .replace(/^www\./, "")
    .trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) || /^\d+(\.\d+)+$/.test(h) || /(^|\.)(local|internal|localhost)$/.test(h)) return null;
  return h;
}

export function domainFromApplyUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return BOARD_HOSTS.test(host) ? null : safeDomain(host);
  } catch {
    return null;
  }
}

export function readCompanyPage(html: string): { title: string; description: string; image: string | null } {
  const head = html.slice(0, 200_000);
  const meta = (name: string) =>
    head.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ??
    head.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"))?.[1] ??
    "";
  const title = decodeEntities(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? meta("og:title")).trim();
  const description = decodeEntities(meta("description") || meta("og:description")).trim();
  const image = meta("og:image");
  return { title: title.slice(0, 200), description: description.slice(0, 600), image: image.startsWith("https://") ? image : null };
}

export function companyLinks(name: string, website: string | null) {
  const q = encodeURIComponent(name);
  return [
    ...(website ? [{ label: "Website", href: website }] : []),
    { label: "LinkedIn", href: `https://www.linkedin.com/search/results/companies/?keywords=${q}` },
    { label: "Glassdoor reviews", href: `https://www.glassdoor.com/Search/results.htm?keyword=${q}` },
    { label: "News", href: `https://www.google.com/search?tbm=nws&q=${q}` },
  ];
}

async function getText(url: string, fetcher: typeof fetch, limit: number) {
  const res = await fetcher(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(6000), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).slice(0, limit);
}

// Domains most companies use, plus Nigeria's. A name search that lands on another country's
// domain (edenlife.com.tn for Eden Life in Lagos) is often a different company.
const COMMON_TLD = /\.(com|co|io|org|net|ai|app|africa|tech|xyz|dev|ng|com\.ng|org\.ng|gov\.ng|edu\.ng)$/;
const norm = (s: string) => s.toLowerCase().replace(/\b(inc|llc|ltd|limited|plc|group|nigeria|company|co)\b|[^a-z0-9]/g, "");

// The company's own website domain: from the apply link when it is on their site, else
// from a company name search. `strict` takes a name search only on an exact name match.
export async function companyDomain(name: string, applyUrl: string, fetcher: typeof fetch = fetch, strict = false): Promise<string | null> {
  return (await companySite(name, applyUrl, fetcher, strict)).domain;
}

export async function companySite(name: string, applyUrl: string, fetcher: typeof fetch = fetch, strict = false): Promise<{ domain: string | null; from: "apply link" | "name search" | null }> {
  const domain = domainFromApplyUrl(applyUrl);
  if (domain) return { domain, from: "apply link" };
  if (!name.trim()) return { domain: null, from: null };
  try {
    const hits = JSON.parse(await getText(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`, fetcher, 20_000)) as { name: string; domain: string }[];
    const exact = hits.filter((h) => norm(h.name) === norm(name) && safeDomain(h.domain));
    const hit = exact.find((h) => COMMON_TLD.test(h.domain)) ?? (strict ? undefined : (exact[0] ?? hits[0]));
    const found = safeDomain(hit?.domain);
    return { domain: found, from: found ? "name search" : null };
  } catch {
    return { domain: null, from: null };
  }
}

export async function lookUpCompany(name: string, applyUrl: string, fetcher: typeof fetch = fetch, now = new Date()): Promise<CompanyInfo> {
  const domain = await companyDomain(name, applyUrl, fetcher);
  const website = domain ? `https://${domain}` : null;
  let page = { title: "", description: "", image: null as string | null };
  if (website) {
    try {
      page = readCompanyPage(await getText(website, fetcher, 200_000));
    } catch {}
  }
  return {
    name,
    domain,
    website,
    summary: page.description,
    logo: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null,
    links: companyLinks(name, website),
    checkedAt: now.toISOString(),
  };
}
