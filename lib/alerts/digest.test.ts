import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_URL, buildDigest } from "./digest.ts";

test("the morning email lists deadlines first, then jobs with their reason and link", () => {
  const d = buildDigest({
    today: "2026-11-26",
    queued: 2,
    autoOn: true,
    jobs: [{ id: "j1", title: "Accessibility Engineer", company: "Acme", reason: "no email on acme.com, so apply on their form", applyUrl: "https://acme.com/jobs/1" }],
    deadlines: [
      { kind: "Conference", name: "One World Summit Japan 2027", deadline: "2026-11-30", href: `${APP_URL}/conferences?view=tracking`, extra: "Fee to apply: £17.99" },
      { kind: "Conference", name: "World Leaders Convention 2027", deadline: "2026-11-29", href: `${APP_URL}/conferences?view=tracking` },
    ],
  });
  assert.equal(d.count, 3);
  assert.match(d.subject, /^3 things need you today, first deadline 2026-11-29$/);
  assert.match(d.text, /2 applications were queued/);
  assert.ok(d.text.indexOf("World Leaders") < d.text.indexOf("One World"));
  assert.match(d.text, /closes in 3 days \(2026-11-29\)/);
  assert.match(d.text, /Accessibility Engineer at Acme: no email on acme\.com/);
  assert.match(d.text, new RegExp(`${APP_URL}/apply\\?job=j1`));
  assert.match(d.text, /Turn this email off in Settings/);
});

test("with nothing waiting, the count is zero so no email is sent", () => {
  const d = buildDigest({ today: "2026-11-26", queued: 0, autoOn: false, jobs: [], deadlines: [] });
  assert.equal(d.count, 0);
  assert.match(d.text, /Auto-apply is off/);
});

test("on a quiet day the email still brings the mindset and today's study", () => {
  const d = buildDigest({ today: "2026-11-27", queued: 0, jobs: [], deadlines: [], autoOn: true, study: [{ name: "Entropy", category: "Science", slug: "science-entropy" }], mindset: { name: "Ant", line: "Small work, every day.", today: "Do 20 minutes." } });
  assert.equal(d.count, 0);
  assert.equal(d.study, 1);
  assert.match(d.subject, /Today's study: Entropy/);
  assert.match(d.text, /Today's mindset: Ant/);
  assert.match(d.text, new RegExp(`${APP_URL}/study\\?topic=science-entropy`));
});
