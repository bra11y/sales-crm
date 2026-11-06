// Job boards added in November 2026: a11yjobs (accessibility jobs worldwide) and Working Nomads
// (remote jobs worldwide). Both allow reading in their robots.txt. a11yjobs has no feed, so its
// sitemap lists the jobs and each job page gives the full post as schema.org JobPosting data.
import { decodeEntities, htmlToText } from "./text.ts";
import type { JobPost } from "./sources.ts";

const DAY = 86_400_000;

const titleFromSlug = (slug: string) =>
  slug
    .replace(/-[A-Za-z0-9]{5,12}$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Job pages end in a short code with a capital or a digit ("…-alfa-VOA10"). Pages without
// one, like /jobs/accessibility-engineer, are category lists, not jobs.
const JOB_PATH = /^https:\/\/(?:www\.)?a11yjobs\.com\/jobs\/([a-z0-9-]+-(?=[A-Za-z0-9]*[A-Z0-9])[A-Za-z0-9]{5,12})$/;

export function parseA11ySitemap(xml: string): JobPost[] {
  const all = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map(([, block]) => ({ loc: block.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() ?? "", mod: block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? "" }))
    .filter((u) => JOB_PATH.test(u.loc));
  // Jobs changed within 30 days of the newest one. Older ones are likely filled.
  const newest = Math.max(0, ...all.map((u) => Date.parse(u.mod) || 0));
  return all
    .filter((u) => !u.mod || newest - Date.parse(u.mod) < 30 * DAY)
    .sort((a, b) => b.mod.localeCompare(a.mod))
    .slice(0, 60)
    .map(({ loc, mod }) => ({
      source: "a11yjobs",
      externalId: loc.replace(/^https:\/\/(www\.)?/, ""),
      title: titleFromSlug(loc.match(JOB_PATH)![1]),
      company: "",
      companyLogo: null,
      url: loc,
      applyUrl: loc,
      description: "",
      location: "",
      restrictions: [],
      pay: null,
      employmentType: "",
      postedAt: mod && !Number.isNaN(Date.parse(mod)) ? new Date(mod).toISOString() : null,
      tags: ["accessibility"],
    }));
}

type Ld = Record<string, unknown>;
const obj = (v: unknown): Ld => (v && typeof v === "object" && !Array.isArray(v) ? (v as Ld) : {});

// The JobPosting data on an a11yjobs page: title, company, where, pay and the full text.
export function readA11yPage(html: string, post: JobPost): JobPost {
  let job: Ld | null = null;
  for (const [, raw] of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(raw) as Ld | Ld[];
      const found = (Array.isArray(d) ? d : [d]).find((x) => x["@type"] === "JobPosting");
      if (found) job = found;
    } catch {}
  }
  if (!job) return post;
  const places = (Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation]).map((l) => obj(obj(l).address)).map((a) => String(a.addressCountry ?? a.addressRegion ?? a.addressLocality ?? "").trim()).filter(Boolean);
  const remote = job.jobLocationType === "TELECOMMUTE";
  const allowed = (Array.isArray(job.applicantLocationRequirements) ? job.applicantLocationRequirements : [job.applicantLocationRequirements]).map((r) => String(obj(r).name ?? "").trim()).filter(Boolean);
  // Remote with no country rules means anywhere.
  const where = remote ? (allowed.length ? allowed : ["Anywhere"]) : places;
  const pay = obj(obj(job.baseSalary).value);
  const min = Number(pay.minValue ?? pay.value) || 0;
  const max = Number(pay.maxValue ?? pay.value) || min;
  const unit = String(pay.unitText ?? "YEAR").toLowerCase();
  return {
    ...post,
    title: decodeEntities(String(job.title ?? post.title)).trim() || post.title,
    company: decodeEntities(String(obj(job.hiringOrganization).name ?? "")).trim(),
    companyLogo: String(obj(job.hiringOrganization).logo ?? "").startsWith("https://") ? String(obj(job.hiringOrganization).logo) : null,
    description: htmlToText(decodeEntities(String(job.description ?? ""))).slice(0, 20_000),
    location: `${[...new Set(where)].join(", ")}${remote ? " (remote)" : places.length ? " (on-site)" : ""}`,
    restrictions: [...new Set(where)],
    pay: min ? { min, max, currency: String(obj(job.baseSalary).currency ?? "USD"), period: unit.startsWith("hour") ? "hour" : unit.startsWith("month") ? "month" : "year" } : null,
    employmentType: String(job.employmentType ?? "")
      .replace(/_/g, " ")
      .toLowerCase(),
    postedAt: job.datePosted ? new Date(String(job.datePosted)).toISOString() : post.postedAt,
  };
}

// Working Nomads: the newest remote jobs as JSON. Development, design and IT jobs are kept.
const WN_KEEP = /^(development|design|system administration|administration|customer success|management)$/i;

export function parseWorkingNomads(body: string): JobPost[] {
  const jobs = JSON.parse(body) as Record<string, unknown>[];
  return jobs
    .filter((j) => WN_KEEP.test(String(j.category_name ?? "")) && String(j.url ?? "").startsWith("https://"))
    .map((j) => {
      const place = String(j.location ?? "").trim();
      return {
        source: "workingnomads",
        externalId: String(j.url),
        title: decodeEntities(String(j.title ?? "")).trim(),
        company: decodeEntities(String(j.company_name ?? "")).trim(),
        companyLogo: null,
        url: String(j.url),
        applyUrl: String(j.url),
        description: htmlToText(String(j.description ?? "")).slice(0, 20_000),
        location: place || "Anywhere",
        // A time zone rule stays whole, so "CET (+/- 3 hours)" is not split at the slash.
        restrictions: /time zone|\b(cet|gmt|utc|est|pst|wat|eet)\b/i.test(place)
          ? [place.replace(/^time zone:\s*/i, "")]
          : place
          .replace(/\bthe\s+/gi, "")
          .split(/\s*[,;/|]\s*|\s+(?:and|or)\s+/)
          .map((p) => p.replace(/\.$/, "").trim())
          .filter((p) => p && !/^(remote|anywhere)$/i.test(p)),
        pay: null,
        employmentType: "",
        postedAt: j.pub_date && !Number.isNaN(Date.parse(String(j.pub_date))) ? new Date(String(j.pub_date)).toISOString() : null,
        tags: String(j.tags ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 12),
      } satisfies JobPost;
    });
}
