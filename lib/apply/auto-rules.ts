// The rules auto-apply follows. Kept apart from the runner so tests can load them alone.

import { findContactEmail } from "../mail/extract.ts";
import type { Prepared } from "./outbox.ts";
import { readyChecks } from "./ready.ts";

export const HOLD_HOURS = 2;
const DAY = 86_400_000;

export type AutoJob = {
  id: string;
  status: string;
  band: string;
  hidden_reason: string | null;
  eligibility: string;
  posted_at: string | null;
  pay_monthly_usd: number | null;
  matched: string[];
  gaps: string[];
  contact_email: string | null;
  description: string;
};

// The quick test, before any letter is written.
export function looksAutomatic(j: AutoJob, now: number): string | null {
  if (j.status !== "new") return "already handled";
  if (j.band !== "strong") return "not a strong fit";
  if (j.hidden_reason) return "hidden";
  if (j.eligibility !== "worldwide" && j.eligibility !== "region" && j.eligibility !== "local" && j.eligibility !== "visa") return "unclear where you can work from";
  if (j.posted_at && now - Date.parse(j.posted_at) > 21 * DAY) return "older than 3 weeks";
  if (!(j.contact_email || findContactEmail(j.description)?.email)) return "no email to apply to";
  return null;
}

// The full test, once the letter and email are ready.
export function readyToSend(job: AutoJob, p: Prepared, now: number): string | null {
  if (p.outbox) return "already in the Outbox";
  if (p.problems.length) return p.problems[0];
  if (p.readCheck) return "the post asks you to show you read it";
  if (/\[[^\]\n]+\](?!\()/.test(p.body)) return "the letter has a gap to fill";
  if (!p.contact?.email) return "no email to apply to";
  const checks = readyChecks(job, { person: p.person, proof: p.proof, problems: p.problems, byEmail: true, mail: p.mail, extension: false, minMonthlyUsd: p.minMonthlyUsd }, now);
  const no = checks.find((c) => c.state === "no");
  return no ? no.text : null;
}
