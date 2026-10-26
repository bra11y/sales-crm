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
};

const BOARD_HOSTS = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|remotive\.com|remoteok\.com|himalayas\.app|jobicy\.com|weworkremotely\.com|arbeitnow\.com|workable\.com|linkedin\.com|indeed\.com)$/i;

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

export async function lookUpCompany(name: string, applyUrl: string, fetcher: typeof fetch = fetch, now = new Date()): Promise<CompanyInfo> {
  let domain = domainFromApplyUrl(applyUrl);
  if (!domain && name.trim()) {
    try {
      const hits = JSON.parse(await getText(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`, fetcher, 20_000)) as { name: string; domain: string }[];
      const wanted = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const hit = hits.find((h) => h.name.toLowerCase().replace(/[^a-z0-9]/g, "") === wanted) ?? hits[0];
      domain = safeDomain(hit?.domain);
    } catch {}
  }
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
