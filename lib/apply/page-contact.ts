// An email address the extension read from a job page that takes applications by email.
// Some job sites hide addresses from programs, so only the person's own browser sees them.
// The CRM keeps the address only when it came from that job's own page.

import { isEmail } from "../mail/extract.ts";

const BOARD_INBOX = /@(hotnigerianjobs\.com|myjobmag\.com|jobberman\.com|ngcareers\.com)$/i;

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

export type PageContact = { email: string; sentence: string };

export function acceptPageContact(
  input: { email?: unknown; sentence?: unknown; url?: unknown },
  job: { url: string; apply_url: string },
): { ok: true; contact: PageContact } | { ok: false; error: string } {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) return { ok: false, error: "That is not an email address." };
  if (BOARD_INBOX.test(email)) return { ok: false, error: "That is the job site's own address, not the employer's." };
  const page = hostOf(String(input.url ?? ""));
  if (!page || (page !== hostOf(job.url) && page !== hostOf(job.apply_url))) return { ok: false, error: "The address must come from this job's own page." };
  const sentence = String(input.sentence ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return { ok: true, contact: { email, sentence: `Read from the job page on ${page}${sentence ? `: "${sentence}"` : ""}` } };
}

// In the page: the emails under "How to Apply" or "Method of Application", as the browser shows them.
// Kept here so the extension and the tests share the same rules.
export function emailsInApplySection(text: string): { emails: string[]; sentence: string } {
  const at = text.search(/method of application|how to apply|to apply,? (please )?send|send (your|their) (cv|applications?|resume)/i);
  if (at < 0) return { emails: [], sentence: "" };
  const part = text.slice(at, at + 1200);
  const emails = [...new Set((part.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase()))].filter((e) => !BOARD_INBOX.test(e));
  const sentence = part.match(/[^.\n]*@[^.\n]*(\.[a-z]{2,}[^.\n]*)*/i)?.[0]?.trim() ?? "";
  return { emails, sentence };
}
