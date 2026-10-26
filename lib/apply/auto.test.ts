import { test } from "node:test";
import assert from "node:assert/strict";
import { looksAutomatic, readyToSend } from "./auto-rules.ts";

const NOW = Date.parse("2026-10-26T10:00:00Z");
const job = {
  id: "j",
  status: "new",
  band: "strong",
  hidden_reason: null,
  eligibility: "worldwide",
  posted_at: "2026-10-24T00:00:00Z",
  pay_monthly_usd: 4000,
  matched: ["React", "WCAG", "ARIA", "NVDA"],
  gaps: [],
  contact_email: "jobs@acme.com",
  description: "",
};
const person = { name: "B", email: "b@x.com", phone: "1", linkedin: "l", portfolio: "p", location: "Abuja" };
const p = {
  outbox: null,
  problems: [],
  readCheck: null,
  body: "Hi Acme team,\n\nI build things.\n\nBest,\nB",
  contact: { email: "jobs@acme.com", sentence: "" },
  person,
  proof: [{}],
  mail: { email: "b@gmail.com", tested: true },
  minMonthlyUsd: 2000,
} as never;

test("only strong, open, recent jobs with an email address are picked", () => {
  assert.equal(looksAutomatic(job, NOW), null);
  assert.equal(looksAutomatic({ ...job, band: "good" }, NOW), "not a strong fit");
  assert.equal(looksAutomatic({ ...job, eligibility: "unknown" }, NOW), "unclear where you can work from");
  assert.equal(looksAutomatic({ ...job, contact_email: null }, NOW), "no email to apply to");
  assert.equal(looksAutomatic({ ...job, posted_at: "2026-09-01T00:00:00Z" }, NOW), "older than 3 weeks");
  assert.equal(looksAutomatic({ ...job, status: "saved" }, NOW), "already handled");
});

test("nothing goes out if the post asks something of you or the letter has a gap", () => {
  assert.equal(readyToSend(job, p, NOW), null);
  assert.match(readyToSend(job, { ...(p as object), readCheck: { word: "BLOOM", tag: "", subject: false, sentence: "" } } as never, NOW)!, /read it/);
  assert.match(readyToSend(job, { ...(p as object), body: "Hi [Hiring manager name]," } as never, NOW)!, /gap/);
  assert.match(readyToSend(job, { ...(p as object), mail: { email: null, tested: false } } as never, NOW)!, /Gmail is not connected/);
  assert.match(readyToSend(job, { ...(p as object), person: { ...person, phone: "" } } as never, NOW)!, /phone/);
  assert.match(readyToSend(job, { ...(p as object), outbox: { status: "queued", sentAt: null } } as never, NOW)!, /Outbox/);
});
