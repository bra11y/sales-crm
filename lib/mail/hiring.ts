// Finds a company's hiring email on its own website, so you can email them your
// application instead of filling in their form.
//
// It only returns an address it saw on the company's own pages, on the company's own
// domain. It never guesses one like careers@company.com: a guess that bounces hurts the
// Gmail account you send from. It also checks the domain can receive email.

import { companySite } from "../jobs/company.ts";
import { USER_AGENT } from "../jobs/run.ts";
import { decodeEntities } from "../jobs/text.ts";

export type HiringEmail = {
  email: string;
  // "hiring": a careers, jobs, HR or recruiting inbox. "general": hello@ or info@, read by
  // someone who can pass it on.
  kind: "hiring" | "general";
  foundOn: string;
  // True when the website came from a search for the company's name, not from the job's own
  // link, so it could be a different company with the same name.
  byName?: boolean;
};

export type HiringLookup = {
  found: HiringEmail | null;
  domain: string | null;
  checked: string[];
  checkedAt: string;
};

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const HIRING = /^(careers?|jobs?|recruit\w*|talent\w*|hiring|hr|human\.?resources|people|peopleops|join\w*|work(withus)?|apply|applications?|cv|resumes?|vacanc\w*|opportunit\w*|internships?)$/i;
const GENERAL = /^(hello|hi|info|contact|contactus|team|office|admin|enquir\w*|inquir\w*|general|mail)$/i;
const NEVER =
  /^(no-?reply|do-?not-?reply|privacy|security|dpo|gdpr|legal|abuse|accommodations?|support|help|billing|invoices?|accounts?|press|media|pr|sales|marketing|partners?|webmaster|postmaster|hostmaster|unsubscribe|bounce\w*|feedback|orders?|returns?|customer\w*|service)$/i;
// Pages most companies use for jobs and contact details. The home page comes first so
// its links to other careers pages can be followed.
const PATHS = ["/", "/careers", "/jobs", "/contact", "/contact-us", "/about", "/join-us", "/work-with-us"];
const LINK_WORDS = /careers?|jobs|join|work(ing)?[- ](with|here|at|for)|vacanc|contact|hiring|team|opportunit/i;

// The address's domain must be the company's domain or one of its subdomains.
function onDomain(email: string, domain: string) {
  const host = email.split("@")[1];
  return host === domain || host.endsWith(`.${domain}`);
}

// Pure: picks the best address from pages already read. Hiring inboxes beat general ones;
// a careers page beats the home page.
export function pickHiringEmail(pages: { url: string; html: string }[], domain: string): HiringEmail | null {
  let best: (HiringEmail & { rank: number }) | null = null;
  for (const [i, page] of pages.entries()) {
    const text = decodeEntities(page.html.replace(/%40|&#64;|&#x40;|\s*\[at\]\s*|\s+\(at\)\s+/gi, "@"));
    const careersPage = /careers?|jobs|join|work(ing)?[-_](with|here|at|for)|vacanc|hiring|opportunit/i.test(new URL(page.url).pathname);
    for (const raw of new Set(text.match(EMAIL) ?? [])) {
      const email = raw.replace(/\.$/, "").toLowerCase();
      const local = email.split("@")[0];
      if (!onDomain(email, domain) || NEVER.test(local) || /\.(png|jpe?g|gif|svg|webp|css|js)$/.test(email)) continue;
      const kind = HIRING.test(local) ? "hiring" : GENERAL.test(local) ? "general" : null;
      if (!kind) continue;
      const rank = (kind === "hiring" ? 100 : 0) + (careersPage ? 10 : 0) - i;
      if (!best || rank > best.rank) best = { email, kind, foundOn: page.url, rank };
    }
  }
  if (!best) return null;
  const { rank, ...found } = best;
  void rank;
  return found;
}

// Links on the home page to careers or contact pages on their site or its subdomains.
export function careerLinks(html: string, base: string, domain = new URL(base).hostname.replace(/^www\./, "")): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    if (!LINK_WORDS.test(`${m[1]} ${m[2].replace(/<[^>]+>/g, " ")}`)) continue;
    try {
      const u = new URL(decodeEntities(m[1]), base);
      const host = u.hostname.replace(/^www\./, "");
      // Their own site or a subdomain of it, like careers.acme.com.
      if (u.protocol === "https:" && (host === domain || host.endsWith(`.${domain}`))) out.add(u.origin + u.pathname);
    } catch {}
  }
  return [...out].slice(0, 4);
}

type Deps = {
  fetcher?: typeof fetch;
  hasMail?: (domain: string) => Promise<boolean>;
  now?: Date;
};

async function hasMailServer(domain: string): Promise<boolean> {
  const { resolveMx } = await import("node:dns/promises");
  try {
    return (await resolveMx(domain)).length > 0;
  } catch {
    return false;
  }
}

async function read(url: string, fetcher: typeof fetch): Promise<{ url: string; html: string } | null> {
  try {
    const res = await fetcher(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    if (!res.ok || !/text\/html|text\/plain/i.test(res.headers.get("content-type") ?? "text/html")) return null;
    return { url: res.url || url, html: (await res.text()).slice(0, 400_000) };
  } catch {
    return null;
  }
}

export async function findHiringEmail(company: string, applyUrl: string, knownDomain: string | null, deps: Deps = {}): Promise<HiringLookup> {
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? new Date();
  const site = knownDomain ? { domain: knownDomain, from: "apply link" as const } : await companySite(company, applyUrl, fetcher, true);
  const domain = site.domain;
  if (!domain)
    return {
      found: null,
      domain: null,
      checked: [],
      checkedAt: now.toISOString(),
    };
  const home = `https://${domain}`;
  const first = await Promise.all(PATHS.map((p) => read(home + p, fetcher)));
  const pages = first.filter((p): p is { url: string; html: string } => Boolean(p));
  const seen = new Set(pages.map((p) => p.url.replace(/\/$/, "")));
  const more = pages[0] && first[0] ? careerLinks(pages[0].html, pages[0].url, domain).filter((u) => !seen.has(u.replace(/\/$/, ""))) : [];
  pages.push(...(await Promise.all(more.map((u) => read(u, fetcher)))).filter((p): p is { url: string; html: string } => Boolean(p)));
  // A redirect to another site (a parked domain, a store front) is not the company's own page.
  const own = pages.filter((p) => {
    try {
      const h = new URL(p.url).hostname.replace(/^www\./, "");
      return h === domain || h.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  });
  let found = pickHiringEmail(own, domain);
  if (found && !(await (deps.hasMail ?? hasMailServer)(found.email.split("@")[1]))) found = null;
  if (found && site.from === "name search") found = { ...found, byName: true };
  return {
    found,
    domain,
    checked: own.map((p) => p.url),
    checkedAt: now.toISOString(),
  };
}

// How the address is described next to the Send to box, and kept on the job.
export function hiringNote(f: HiringEmail): string {
  const where = f.foundOn.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
  const what = f.kind === "hiring" ? "It is their hiring inbox." : "It is their general inbox, so ask them to pass it to the hiring team.";
  return `Found on their website (${where}). ${what}${f.byName ? " We found this site by the company's name, so check it is the right company." : ""}`;
}

export const FOUND_PREFIX = "Found on their website";
