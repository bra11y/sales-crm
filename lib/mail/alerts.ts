// Turns job-alert emails (LinkedIn, Indeed, Glassdoor and remote boards) into job posts.
// The email already lists each job's title, company, place and link, so nothing is
// fetched from those sites: the CRM only reads mail they sent to you.

import type { JobPost } from "../jobs/sources.ts";

export type AlertMail = { from: string; subject: string; text: string; receivedAt?: string };

// Board -> the source id it is saved under. Ids must match ^[a-z]{2,30}$.
const BOARDS: { source: string; name: string; domain: RegExp }[] = [
  { source: "linkedin", name: "LinkedIn alert", domain: /(^|\.)linkedin\.com$/ },
  { source: "indeed", name: "Indeed alert", domain: /(^|\.)indeed\.(com|ng|co\.uk)$/ },
  { source: "glassdoor", name: "Glassdoor alert", domain: /(^|\.)glassdoor\.(com|co\.uk)$/ },
  { source: "emailalert", name: "Job alert email", domain: /(^|\.)(wellfound\.com|angel\.co|otta\.com|welcometothejungle\.com|workingnomads\.com|jobgether\.com|a11yjobs\.com|dribbble\.com|himalayas\.app|remotive\.com|weworkremotely\.com|remoteok\.com|jobicy\.com)$/ },
];
export const ALERT_SOURCES = Object.fromEntries(BOARDS.map((b) => [b.source, { name: b.name, home: "https://mail.google.com" }]));

export function alertBoard(from: string) {
  const domain = from.toLowerCase().split("@")[1] ?? "";
  return BOARDS.find((b) => b.domain.test(domain)) ?? null;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
// Lines in alert emails that are not a title, company or place.
const NOISE = /^(view job|see (all )?jobs?|apply( now)?|easy apply|easily apply|actively recruiting|promoted|new|be an early applicant|\d+ (connections?|applicants?|alumni|school alum\w*)\b.*|\d+\+? (new )?jobs? match.*|your job alert.*|job alert.*|.*new jobs? (for|match).*|responsive employer|urgently hiring|hiring multiple candidates|just posted|today|\d+ (hours?|days?|weeks?) ago|posted .*|(\$|£|€|ngn|₦)\s?\d.*|.*\b(a|per) (year|month|hour|week)\b.*|unsubscribe.*|manage (your )?alerts?.*|.*(privacy|help center|preferences|this email was intended).*|-+|=+|_+|\*+|[·•|]+)$/i;
const SEP = /^\s*([-=_*]{3,}|[·•]{3,})\s*$/;

// One canonical address per job, so the same job from two alerts is saved once.
export function jobLink(raw: string): { id: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(raw.replace(/[.,;]+$/, ""));
  } catch {
    return null;
  }
  if (u.protocol !== "https:") u.protocol = "https:";
  const host = u.hostname.replace(/^www\./, "");
  const li = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/);
  if (/(^|\.)linkedin\.com$/.test(host)) return li ? { id: `li-${li[1]}`, url: `https://www.linkedin.com/jobs/view/${li[1]}/` } : null;
  if (/(^|\.)indeed\./.test(host)) {
    const jk = u.searchParams.get("jk") ?? u.searchParams.get("vjk");
    return jk && /^[a-z0-9]{8,24}$/i.test(jk) ? { id: `in-${jk}`, url: `https://www.indeed.com/viewjob?jk=${jk}` } : null;
  }
  if (/(^|\.)glassdoor\./.test(host)) {
    const jl = u.searchParams.get("jobListingId") ?? u.searchParams.get("jl") ?? u.pathname.match(/jl=?(\d{6,})|_JL(\d{6,})|-(\d{9,})\.htm/)?.slice(1).find(Boolean);
    return jl ? { id: `gd-${jl}`, url: `https://www.glassdoor.com/job-listing/index.htm?jl=${jl}` } : null;
  }
  if (!/\/(jobs?|careers?|positions?|openings?|remote-jobs|companies\/[^/]+\/jobs)\//i.test(u.pathname)) return null;
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref|trk|tracking|source|mc_|lipi|midtoken)/i.test(k)) u.searchParams.delete(k);
  u.hash = "";
  const url = u.toString();
  return { id: url.slice(0, 280), url };
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s·•|>-]+|[\s·•|]+$/g, "").trim();

// Splits "Acme Inc - Remote" or "Acme · Lagos, Nigeria" into company and place.
function companyAndPlace(line: string): [string, string] {
  const m = line.match(/^(.+?)\s+(?:[-–·|•]|at)\s+(.+)$/);
  return m ? [clean(m[1]), clean(m[2])] : [clean(line), ""];
}

const PLACE = /\b(remote|hybrid|on-?site|worldwide|anywhere|united states|usa|uk|united kingdom|europe|emea|africa|nigeria|lagos|abuja|canada|germany|india|\b[A-Z][a-z]+, [A-Z]{2}\b)/i;

export function parseAlert(mail: AlertMail): JobPost[] {
  const board = alertBoard(mail.from);
  if (!board) return [];
  const out = new Map<string, JobPost>();
  let block: string[] = [];
  for (const raw of mail.text.replace(/\r/g, "").split("\n")) {
    if (SEP.test(raw)) {
      block = [];
      continue;
    }
    const urls = raw.match(URL_RE) ?? [];
    const words = clean(raw.replace(URL_RE, "").replace(/^(view job|apply|see job)\s*:?/i, ""));
    if (words && !NOISE.test(words) && words.length <= 140) block.push(words);
    for (const href of urls) {
      const link = jobLink(href);
      if (!link || out.has(link.id) || !block.length) continue;
      const [title, second = "", third = ""] = block;
      let [company, place] = companyAndPlace(second);
      if (!place && third && PLACE.test(third)) place = third;
      if (!place && PLACE.test(company) && !third) [company, place] = ["", company];
      if (title.length < 3 || /^https?:/i.test(title)) continue;
      out.set(link.id, {
        source: board.source,
        externalId: link.id,
        title: title.slice(0, 200),
        company: company.slice(0, 120),
        companyLogo: null,
        url: link.url,
        applyUrl: link.url,
        description: `${title}${company ? ` at ${company}` : ""}${place ? `. ${place}` : ""}. From your ${board.name.replace(/ alert$/, "")} job alert: “${mail.subject.slice(0, 120)}”. Open the post to read the full details.`,
        location: place.slice(0, 200),
        restrictions: place ? place.split(/\s*[,;/|]\s*/).map((p) => p.replace(/\((remote|hybrid|on-?site)\)/i, "").trim()).filter((p) => p && !/^(remote|hybrid|on-?site)$/i.test(p)) : [],
        pay: null,
        employmentType: "",
        postedAt: mail.receivedAt ?? null,
        tags: [],
      });
      block = [];
    }
  }
  return [...out.values()];
}
