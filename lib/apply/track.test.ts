import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMail, companyDomains, isJobSender, matchJob, nextStatus, rootDomain } from "./track.ts";

test("emails about an application are read for what they mean", () => {
  assert.equal(classifyMail("Thank you for applying to Acme", "We received your application. If your experience matches, we may be in touch to schedule an interview."), "confirmed");
  assert.equal(classifyMail("Your application to Acme", "Thanks for applying. Unfortunately we have decided to move forward with other candidates."), "rejected");
  assert.equal(classifyMail("Next steps with Acme", "We'd love to schedule a call. Please pick a time: https://calendly.com/acme/30min"), "interview");
  assert.equal(classifyMail("Thank you for applying", "Please book a time for your phone screen here: https://cal.com/acme"), "interview");
  assert.equal(classifyMail("Offer", "We are pleased to extend an offer for the role."), "offer");
  assert.equal(classifyMail("Quick question", "Can you share your notice period?"), "replied");
});

test("the email is tied to the right job", () => {
  const jobs = [
    { id: "a", company: "Acme Inc", domains: companyDomains(["https://careers.acme.com/jobs/1"]) },
    { id: "b", company: "Mozilla", domains: companyDomains(["https://job-boards.greenhouse.io/mozilla/jobs/2"]) },
  ];
  assert.deepEqual(jobs[0].domains, ["acme.com"]);
  assert.deepEqual(jobs[1].domains, []);
  assert.equal(matchJob({ from: "talent@acme.com", subject: "Hi", text: "" }, jobs)?.id, "a");
  assert.equal(matchJob({ from: "no-reply@us.greenhouse-mail.io", subject: "Thank you for applying to Mozilla", text: "" }, jobs)?.id, "b");
  assert.equal(matchJob({ from: "no-reply@greenhouse-mail.io", subject: "Thank you for applying to Stripe", text: "" }, jobs), null);
  assert.equal(matchJob({ from: "friend@gmail.com", subject: "Mozilla news", text: "" }, jobs), null);
  assert.ok(isJobSender("no-reply@hire.lever.co", jobs));
  assert.ok(isJobSender("people@jobs.acme.com", jobs));
  assert.ok(!isJobSender("friend@gmail.com", jobs));
  assert.equal(rootDomain("jobs.acme.co.uk"), "acme.co.uk");
});

test("status only moves forward, and a no can come at any time", () => {
  assert.equal(nextStatus("applied", "confirmed"), "applied");
  assert.equal(nextStatus("saved", "confirmed"), "applied");
  assert.equal(nextStatus("applied", "interview"), "interview");
  assert.equal(nextStatus("interview", "replied"), "interview");
  assert.equal(nextStatus("no_reply", "replied"), "replied");
  assert.equal(nextStatus("interview", "rejected"), "rejected");
  assert.equal(nextStatus("offer", "rejected"), "offer");
  assert.equal(nextStatus("rejected", "interview"), "rejected");
});
