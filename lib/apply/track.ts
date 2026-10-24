// Reads emails about applications you sent on a form (Greenhouse, Lever, Workday…)
// and decides which job each one is about and what it means. Keyword rules, no AI.

export type MailKind = "confirmed" | "replied" | "interview" | "offer" | "rejected";
export type Status = "new" | "saved" | "applied" | "replied" | "interview" | "offer" | "rejected" | "no_reply" | "dismissed";
export type TrackedJob = { id: string; company: string; domains: string[] };
export type Mail = { from: string; subject: string; text: string };

// Senders that email you on behalf of the company you applied to.
const ATS = /(^|\.)(greenhouse\.io|greenhouse-mail\.io|lever\.co|ashbyhq\.com|workable\.com|workablemail\.com|smartrecruiters\.com|myworkday\.com|workday\.com|icims\.com|teamtailor\.com|teamtailormail\.com|recruitee\.com|breezy\.hr|jazzhr\.com|applytojob\.com|bamboohr\.com|rippling\.com|personio\.(com|de)|jobvite\.com|successfactors\.(com|eu)|taleo\.net|oraclecloud\.com|dover\.com|gem\.com|pinpointhq\.com|wellfound\.com|linkedin\.com|indeed\.com|indeedemail\.com|himalayas\.app|remote\.com|deel\.com)$/i;
// Job boards and ATS hosts are never a company's own domain.
const SHARED = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|myworkdayjobs\.com|myworkday\.com|icims\.com|teamtailor\.com|recruitee\.com|breezy\.hr|applytojob\.com|bamboohr\.com|rippling\.com|personio\.(com|de)|jobvite\.com|linkedin\.com|indeed\.com|glassdoor\.com|himalayas\.app|remotive\.com|remoteok\.com|weworkremotely\.com|jobicy\.com|arbeitnow\.com|wellfound\.com|google\.com|gmail\.com)$/i;

const CONFIRMED = /\b(thanks?|thank you) for (applying|your application|submitting your application|your interest in (the|our)?[^.]{0,60}(role|position|job))|\b(we('ve| have)|we) received your application|\bapplication (has been |was )?(received|submitted|sent)\b|\byour application (to|for) [^.]{2,80} (has been|was) (received|submitted|sent)|\bsuccessfully (applied|submitted)\b/i;
const REJECTED = /\b(unfortunately|not (be )?moving forward|move forward with other|other candidates|decided to (pursue|proceed with|move forward with) other|position (has been|is) (filled|closed)|no longer (open|available|considering)|not (a|the right) (fit|match)|regret to inform|will not be (proceeding|progressing|moving)|not been (selected|successful)|unsuccessful)\b/i;
const OFFER = /\b(offer letter|pleased to (extend|offer)|extend (you )?(an|the) offer|job offer|offer of employment|formal offer)\b/i;
const INTERVIEW = /\b(interview|schedule a (call|chat|time)|book a (time|call|slot)|calendly\.com|cal\.com|goodtime\.io|next steps?|your availability|available (to|for) (a )?(call|chat)|phone screen|screening call|assessment|take-home|technical (test|challenge)|coding (test|challenge))\b/i;
// A real invitation, not "we may be in touch to schedule an interview" in a receipt.
const INVITE = /\b(calendly\.com|cal\.com|goodtime\.io|book a (time|call|slot)|pick a time|your availability|(invite|invitation) (you )?to (an? )?(interview|call|chat)|would (like|love) to (schedule|invite|speak|chat|talk)|take-home|coding (test|challenge))\b/i;

export function classifyMail(subject: string, text: string): MailKind {
  const body = `${subject}\n${text.slice(0, 4000)}`;
  if (REJECTED.test(body)) return "rejected";
  if (OFFER.test(body)) return "offer";
  if (CONFIRMED.test(body)) return INVITE.test(body) ? "interview" : "confirmed";
  if (INTERVIEW.test(body)) return "interview";
  return "replied";
}

// The base domain of a host: careers.acme.com -> acme.com, jobs.acme.co.uk -> acme.co.uk.
export function rootDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  const two = parts.slice(-2).join(".");
  return /^(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(two) && parts.length > 2 ? parts.slice(-3).join(".") : two;
}

// The company's own domains, from the apply link and the company website.
export function companyDomains(urls: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    try {
      const host = new URL(u ?? "").hostname;
      if (host && !SHARED.test(host)) out.add(rootDomain(host));
    } catch {
      // not a link
    }
  }
  return [...out];
}

const domainOf = (email: string) => email.split("@").pop()?.toLowerCase() ?? "";
const plain = (s: string) => s.toLowerCase().replace(/\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|plc|group|technologies|labs)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function isJobSender(from: string, jobs: TrackedJob[]): boolean {
  const d = domainOf(from);
  return ATS.test(d) || jobs.some((j) => j.domains.some((x) => d === x || d.endsWith(`.${x}`)));
}

// Which job an email is about: the company's own domain first, then its name in the subject or opening.
export function matchJob(m: Mail, jobs: TrackedJob[]): TrackedJob | null {
  const d = domainOf(m.from);
  const own = jobs.filter((j) => j.domains.some((x) => d === x || d.endsWith(`.${x}`)));
  if (own.length === 1) return own[0];
  const pool = own.length ? own : ATS.test(d) ? jobs : [];
  const hay = ` ${plain(`${m.subject}\n${m.from.split("@")[0]}\n${m.text.slice(0, 1500)}`)} `;
  const named = pool.filter((j) => {
    const name = plain(j.company);
    return name.length >= 3 && hay.includes(` ${name} `);
  });
  // Two jobs at the same company: the newest one is first in the list.
  return named[0] ?? null;
}

// Status only moves forward, except a rejection, which can come at any time.
const RANK: Record<Status, number> = { dismissed: -1, new: 0, saved: 1, applied: 2, no_reply: 3, replied: 4, interview: 5, offer: 6, rejected: 7 };
const TARGET: Record<MailKind, Status | null> = { confirmed: "applied", replied: "replied", interview: "interview", offer: "offer", rejected: "rejected" };

export function nextStatus(current: Status, kind: MailKind): Status {
  const want = TARGET[kind];
  if (!want || current === "rejected" || current === "offer") return current;
  if (want === "rejected") return "rejected";
  return RANK[want] > RANK[current] ? want : current;
}

export const EVENT_TITLE: Record<MailKind, (company: string) => string> = {
  confirmed: (c) => `${c || "The company"} confirmed they received it`,
  replied: (c) => `${c || "The company"} replied`,
  interview: (c) => `${c || "The company"} asked to talk`,
  offer: (c) => `Offer from ${c || "the company"}`,
  rejected: (c) => `${c || "The company"} said no this time`,
};
