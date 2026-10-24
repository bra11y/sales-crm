import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import assert from "node:assert/strict";
import F from "../apply/facts.js";
import { readyChecks, readySummary } from "../apply/ready.ts";
import { DEFAULT_PREFERENCES } from "../jobs/preferences.ts";
import { scoreJob } from "../jobs/fit.ts";
import type { Facts } from "../jobs/facts.ts";
import { cvPdf, runs } from "../pdf/cv.ts";
import { alertBoard, jobLink, parseAlert } from "./alerts.ts";

const LINKEDIN = `Your job alert for accessibility in Worldwide
3 new jobs match your preferences.

Senior Accessibility Engineer
Mozilla
Remote
Actively recruiting
View job: https://www.linkedin.com/comm/jobs/view/4045678901/?trackingId=abc%3D%3D&refId=x&lipi=y

---------------------------------------------------------

Digital Accessibility Specialist
Hyphen · United States (Remote)
Easy Apply
View job: https://www.linkedin.com/comm/jobs/view/4045678902/?trackingId=def

---------------------------------------------------------

Accessibility Tester
Acme Nigeria
Lagos, Lagos State, Nigeria (Hybrid)
2 connections
View job: https://www.linkedin.com/comm/jobs/view/4045678903/
View job: https://www.linkedin.com/comm/jobs/view/4045678903/?again=1

See all jobs: https://www.linkedin.com/comm/jobs/search?keywords=accessibility
Unsubscribe: https://www.linkedin.com/comm/psettings/email-unsubscribe?x=1`;

const INDEED = `Front End Developer (Accessibility)
Tuva - Remote
$4,000 - $5,000 a month
Easily apply
https://ng.indeed.com/rc/clk/dl?jk=0a1b2c3d4e5f6a7b&from=ja&qd=x

UX Designer
Beta Studio - Abuja
Just posted
https://ng.indeed.com/pagead/clk/dl?mo=r&vjk=9f8e7d6c5b4a3921&from=ja`;

test("LinkedIn alert emails become one job each, with the tracking stripped", () => {
  const jobs = parseAlert({ from: "jobalerts-noreply@linkedin.com", subject: "accessibility: 3 new jobs", text: LINKEDIN, receivedAt: "2026-10-24T08:00:00Z" });
  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map((j) => [j.title, j.company, j.location]), [
    ["Senior Accessibility Engineer", "Mozilla", "Remote"],
    ["Digital Accessibility Specialist", "Hyphen", "United States (Remote)"],
    ["Accessibility Tester", "Acme Nigeria", "Lagos, Lagos State, Nigeria (Hybrid)"],
  ]);
  assert.equal(jobs[0].applyUrl, "https://www.linkedin.com/jobs/view/4045678901/");
  assert.equal(jobs[0].externalId, "li-4045678901");
  assert.equal(jobs[0].source, "linkedin");
  assert.deepEqual(jobs[1].restrictions, ["United States"]);
  assert.deepEqual(jobs[0].restrictions, []);
});

test("Indeed alert emails split company and place", () => {
  const jobs = parseAlert({ from: "alert@indeed.com", subject: "New jobs", text: INDEED });
  assert.deepEqual(jobs.map((j) => [j.title, j.company, j.location, j.url]), [
    ["Front End Developer (Accessibility)", "Tuva", "Remote", "https://www.indeed.com/viewjob?jk=0a1b2c3d4e5f6a7b"],
    ["UX Designer", "Beta Studio", "Abuja", "https://www.indeed.com/viewjob?jk=9f8e7d6c5b4a3921"],
  ]);
});

test("only job-alert senders and real job links count", () => {
  assert.equal(alertBoard("friend@gmail.com"), null);
  assert.equal(alertBoard("messages-noreply@linkedin.com")?.source, "linkedin");
  assert.equal(parseAlert({ from: "friend@gmail.com", subject: "hi", text: LINKEDIN }).length, 0);
  assert.equal(jobLink("https://www.linkedin.com/feed/update/123"), null);
  assert.equal(jobLink("https://wellfound.com/jobs/12345-designer?utm_source=x")?.url, "https://wellfound.com/jobs/12345-designer");
  assert.equal(jobLink("not a url"), null);
});

test("alert jobs score in your fields and keep US-only roles hidden", () => {
  const [open, us, lagos] = parseAlert({ from: "jobalerts-noreply@linkedin.com", subject: "a11y", text: LINKEDIN, receivedAt: "2026-10-24T08:00:00Z" });
  const now = new Date("2026-10-24T12:00:00Z");
  assert.equal(scoreJob(open, F as unknown as Facts, DEFAULT_PREFERENCES, now).hidden, null);
  assert.match(scoreJob(us, F as unknown as Facts, DEFAULT_PREFERENCES, now).hidden ?? "", /United States/);
  assert.match(scoreJob(lagos, F as unknown as Facts, DEFAULT_PREFERENCES, now).hidden ?? "", /Not remote/);
  assert.ok(scoreJob(open, F as unknown as Facts, DEFAULT_PREFERENCES, now).flags.some((f) => f.startsWith("From a job alert")));
});

test("the CV shows links as short clickable words, not addresses", async () => {
  assert.deepEqual(runs("Abuja | [LinkedIn](https://www.linkedin.com/in/x) and **bold**"), [
    { text: "Abuja | ", bold: false },
    { text: "LinkedIn", bold: false, href: "https://www.linkedin.com/in/x" },
    { text: " and ", bold: false },
    { text: "bold", bold: true },
  ]);
  const bytes = await cvPdf("# Name\n\nEngineer\n\nAbuja | [LinkedIn](https://www.linkedin.com/in/x)\n\n## Experience\n\n### Engineer | 2023 - Present\n\nAcme | Remote\n\n- Did a thing", "CV");
  const page = (await PDFDocument.load(bytes)).getPage(0);
  const annots = page.node.Annots();
  assert.equal(annots?.size(), 1);
  assert.match(String(page.node.context.lookup(annots!.get(0))), /https:\/\/www\.linkedin\.com\/in\/x/);
});

test("the ready check names what to fix before you apply", () => {
  const person = { name: "B", email: "b@x.com", phone: "1", linkedin: "l", portfolio: "", location: "Abuja" };
  const base = { eligibility: "worldwide", hidden_reason: null, pay_monthly_usd: 5000, posted_at: "2026-10-22T00:00:00Z", matched: ["React", "WCAG", "NVDA", "ARIA"], gaps: [] };
  const now = Date.parse("2026-10-24T00:00:00Z");
  const checks = readyChecks(base, { person, proof: [{}], problems: [], byEmail: false, mail: { email: null, tested: false }, extension: true, minMonthlyUsd: 2000 }, now);
  const fix = checks.filter((c) => c.state === "no");
  assert.equal(fix.length, 1);
  assert.match(fix[0].text, /portfolio/);
  assert.equal(readySummary(checks), "1 thing to fix first");
  const email = readyChecks(base, { person: { ...person, portfolio: "p" }, proof: [{}], problems: [], byEmail: true, mail: { email: "b@x.com", tested: true }, extension: false, minMonthlyUsd: 2000 }, now);
  assert.equal(readySummary(email), "Ready to apply");
  const low = readyChecks({ ...base, pay_monthly_usd: 900, eligibility: "restricted", hidden_reason: "Open only to United States" }, { person, proof: [], problems: [], byEmail: false, mail: { email: null, tested: false }, extension: false, minMonthlyUsd: 2000 }, now);
  assert.ok(low.some((c) => c.state === "no" && /United States/.test(c.text)));
  assert.ok(low.some((c) => c.state === "no" && /\$900/.test(c.text)));
});
