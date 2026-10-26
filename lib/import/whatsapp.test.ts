import { test } from "node:test";
import assert from "node:assert/strict";
import { chatToJob, parseChat, parseDeadline, roleAndCompany, stillOpen } from "./whatsapp.ts";

// Made-up posts in the same shape as a real export. No real names or numbers.
const CHAT = `[10/20/26, 07:32:43] ~ Sender One: *Remote Job at Example Co – 2 Positions*

*Benefits:*
* €50,000 – €80,000
* Fully Remote

* Location: Remote | Global
* Deadline: Not Specified

*Click here to apply 📌*
https://www.jobsregion.com/remote-job-at-example/

*🔊 Shared by Jobs Region*
---
Join our WhatsApp channel; simply click this link [https://whatsapp.com/channel/abc] and follow.
[10/26/26, 08:33:07] ‪+234 800 000 0000‬: *Fresh Opportunity*

*Erasmus Mundus Example Scholarship in Europe 2027 | Fully Funded*
https://www.scholarshipregion.com/erasmus-example/

*Host Countries:* France 🇫🇷 | Netherlands 🇳🇱

*Eligible Country:* All Countries

*Requirements:*
- Transcripts and two recommendation letters
- IELTS score

*Deadline:* December 15, 2026
[10/26/26, 09:00:00] ~ Sender Two: *Erasmus Mundus Example Scholarship in Europe 2027 | Fully Funded*
https://www.scholarshipregion.com/erasmus-example/
[10/26/26, 09:10:00] ~ Sender Two: Good morning everyone
[3/1/26, 10:00:00] ~ Sender Three: *Old Scholarship For Ghana Only*
https://www.scholarshipregion.com/old-ghana/
*Eligible Country:* Ghana
*Deadline:* March 30, 2026`;

test("keeps the posts, drops chatter and repeats, and never keeps who sent them", () => {
  const p = parseChat(CHAT);
  assert.equal(p.length, 3);
  const [job, sch] = p;
  assert.equal(job.kind, "job");
  assert.equal(job.title, "Remote Job at Example Co – 2 Positions");
  assert.equal(job.where, "Remote, Global");
  assert.equal(job.deadline, null);
  assert.equal(sch.kind, "scholarship");
  assert.equal(sch.title, "Erasmus Mundus Example Scholarship in Europe 2027 | Fully Funded");
  assert.equal(sch.where, "France, Netherlands");
  assert.equal(sch.deadline, "2026-12-15");
  assert.equal(sch.sharedAt, "2026-10-26");
  assert.deepEqual(sch.needs.sort(), ["language_test", "recommendation", "transcript"]);
  assert.ok(!JSON.stringify(p).includes("Sender") && !JSON.stringify(p).includes("+234"), "sender kept");
});

test("open posts are still running and open to Nigerians", () => {
  const [job, sch, old] = parseChat(CHAT);
  assert.ok(stillOpen(sch, "2026-10-26"));
  assert.ok(stillOpen(job, "2026-10-26"));
  assert.ok(!stillOpen(old, "2026-10-26"));
  assert.ok(!stillOpen({ ...job, sharedAt: "2026-06-01" }, "2026-10-26"), "an undated post from months ago");
  assert.equal(parseDeadline("4th December, 2026"), "2026-12-04");
  assert.equal(parseDeadline("Varies by Program"), null);
});

test("a chat job becomes a job post with its role and company split out", () => {
  assert.deepEqual(roleAndCompany("Customer Support Officer Job at LemFi (Formerly Lemonade Finance) | Hybrid"), { role: "Customer Support Officer", company: "LemFi" });
  assert.deepEqual(roleAndCompany("2026 Graduate Trainee Program at Leventis Nigeria"), { role: "Graduate Trainee Program", company: "Leventis Nigeria" });
  assert.deepEqual(roleAndCompany("10 Ongoing Graduate Trainee Recruitments in Nigeria").company, "");
  const [job] = parseChat(CHAT);
  const j = chatToJob(job);
  assert.equal(j.source, "whatsapp");
  assert.equal(j.company, "Example Co");
  assert.equal(j.location, "Remote, Global");
  assert.ok(j.pay, "pay read from benefits");
});
