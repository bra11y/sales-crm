import { test } from "node:test";
import assert from "node:assert/strict";
import F from "./facts.js";
import M from "../../extension/match.js";
import type { Facts } from "../jobs/facts.ts";
import { cleanFacts, storeFacts } from "../jobs/facts.ts";
import { draftApplication, followUps } from "./compose.ts";
import { jobKey } from "./page-key.ts";
import { pickProof, proofBlock } from "./proof.ts";

const facts = F as unknown as Facts;
const shopifyJob = "Shopify Developer. Our Liquid theme is slow: we need someone to fix Core Web Vitals and make it accessible (WCAG).";

test("picks the proof that fits the job, best first, at most 3", () => {
  const picks = pickProof(shopifyJob, facts.work, ["Shopify"]);
  assert.ok(picks.length <= 3 && picks.length >= 2);
  // The post asks for speed and accessibility, so both Shopify items lead.
  assert.deepEqual(picks.slice(0, 2).map((p) => p.title).sort(), ["Lotus Shopify components", "Shopify speed rescue"]);
});

test("with nothing matching, still offers work that has a link", () => {
  const picks = pickProof("Office manager. Answer phones and order supplies.", facts.work);
  assert.ok(picks.length > 0 && picks.every((p) => p.url));
});

test("the email carries the proof block with links, before the CV line", () => {
  const job = { title: "Frontend Engineer", company: "Kola Pay", description: "Build our merchant dashboard in React and Next.js with Supabase and payments." };
  const d = draftApplication(job, facts, "I want to help Kola Pay.");
  assert.match(d.body, /Work you can check:\n- Bihub: .+ https:\/\/bihubng\.vercel\.app/);
  assert.ok(d.body.indexOf("Work you can check:") < d.body.indexOf("My CV is attached"));
  assert.equal(proofBlock([]), "");
  const [one] = followUps(facts, { role: "Frontend Engineer", company: "Kola Pay", manager: "", matched: d.matched, sentAt: new Date("2026-10-20T10:00:00Z"), proof: d.proof });
  assert.match(one, /You can see Bihub here: https:\/\/bihubng\.vercel\.app/);
});

test("cleaning keeps proof and answers, and drops links that are not https", () => {
  const base = storeFacts(facts);
  const out = cleanFacts({ ...base, work: [{ title: "X", what: "w", result: "r", url: "javascript:alert(1)", tags: ["A"] }, { title: "", what: "", result: "", url: "", tags: [] }], answers: [{ question: "Salary", words: ["Salary"], answer: "$40k" }] }, base);
  assert.equal(out.work.length, 1);
  assert.equal(out.work[0].url, "");
  assert.deepEqual(out.work[0].tags, ["a"]);
  assert.deepEqual(out.answers, [{ question: "Salary", words: ["salary"], answer: "$40k" }]);
});

test("finds the job id inside Greenhouse, Lever and Ashby links", () => {
  assert.equal(jobKey("https://job-boards.greenhouse.io/vercel/jobs/5012345007"), "5012345007");
  assert.equal(jobKey("https://vercel.com/careers?gh_jid=5012345007"), "5012345007");
  assert.equal(jobKey("https://jobs.lever.co/spotify/2f4b9a10-1c2d-4e5f-8a9b-0c1d2e3f4a5b/apply"), "2f4b9a10-1c2d-4e5f-8a9b-0c1d2e3f4a5b");
  assert.equal(jobKey("https://jobs.ashbyhq.com/linear/9a8b7c6d-1111-2222-3333-444455556666/application"), "9a8b7c6d-1111-2222-3333-444455556666");
  assert.equal(jobKey("not a url"), null);
});

test("the form filler knows which box is which", () => {
  assert.equal(M.classify("First Name *", null, "text"), "firstName");
  assert.equal(M.classify("Last name", null, "text"), "lastName");
  assert.equal(M.classify("job_application[email]", null, "text"), "email");
  assert.equal(M.classify("Phone", null, "text"), "phone");
  assert.equal(M.classify("LinkedIn Profile", null, "text"), "linkedin");
  assert.equal(M.classify("Website", null, "url"), "portfolio");
  assert.equal(M.classify("Full name", null, "text"), "fullName");
  assert.equal(M.classify("Current company name", null, "text"), null);
  assert.equal(M.classify("Name of a referrer", null, "text"), null);
  assert.equal(M.classify("anything", "given-name", "text"), "firstName");
  assert.equal(M.classify("What is the name of a product you admire and why?", null, "text"), null);
});

const kit = {
  answers: [
    { question: "Salary expectation", words: ["salary"], answer: "$4,000 a month" },
    { question: "Do you need visa sponsorship?", words: ["sponsorship"], answer: "" },
  ],
  generated: { why: "WHY", proof: "PROOF", links: "LINKS", cover: "COVER", hear: "HEAR", extra: "EXTRA" },
};

test("answers form questions from saved answers first, then from your proof", () => {
  assert.equal(M.answerFor("What are your salary expectations?", kit)?.answer, "$4,000 a month");
  assert.equal(M.answerFor("Why do you want to work at Vercel?", kit)?.answer, "WHY");
  assert.equal(M.answerFor("Tell us about a project you're proud of", kit)?.answer, "PROOF");
  assert.equal(M.answerFor("Cover Letter", kit)?.answer, "COVER");
  assert.equal(M.answerFor("How did you hear about this job?", kit)?.answer, "HEAR");
  assert.equal(M.answerFor("Anything else you'd like us to know?", kit)?.answer, "EXTRA");
  assert.equal(M.answerFor("Will you now or in the future require sponsorship?", kit), null);
  assert.equal(M.missingAnswer("Will you now or in the future require sponsorship?", kit)?.question, "Do you need visa sponsorship?");
});

test("only a resume box gets the CV, never a photo or cover letter box", () => {
  assert.equal(M.isResumeInput("Resume/CV", ".pdf,.doc"), true);
  assert.equal(M.isResumeInput("Cover Letter", ".pdf"), false);
  assert.equal(M.isResumeInput("Profile photo", "image/*,.pdf"), false);
});

test("the CV goes to the box named Resume, not an autofill box that also takes PDFs", () => {
  const boxes = [
    { text: "Autofill from resume", accept: ".pdf" },
    { text: "Name", accept: ".pdf,.doc" },
    { text: "Resume _systemfield_resume", accept: ".pdf" },
  ];
  assert.equal(M.pickResume(boxes)?.text, "Resume _systemfield_resume");
  assert.equal(M.pickResume([{ text: "Attach", accept: ".pdf" }])?.text, "Attach");
  assert.equal(M.pickResume([{ text: "Cover Letter", accept: ".pdf" }]), null);
});

test("passport and citizenship boxes are left for you", () => {
  assert.equal(M.classify("Passport Country", null, "text"), null);
  assert.equal(M.classify("Country of citizenship", null, "text"), null);
  assert.equal(M.classify("Country of Residence", null, "text"), "country");
});

test("the helper finds the listing's Apply button and skips sign-in shortcuts", () => {
  assert.equal(M.applyScore("Apply now", "https://x.test/jobs/1"), 3);
  assert.equal(M.applyScore("Apply for this job"), 3);
  assert.equal(M.applyScore("Apply on company website"), 2);
  assert.equal(M.applyScore("Easy Apply"), 0);
  assert.equal(M.applyScore("Apply with LinkedIn"), 0);
  assert.equal(M.applyScore("How to apply"), 0);
  assert.equal(M.applyScore("Save job"), 0);
});

test("the helper knows the thank-you page", () => {
  assert.ok(M.isSuccess("Thank you for applying to Current! We'll be in touch."));
  assert.ok(M.isSuccess("Your application has been submitted."));
  assert.ok(M.isSuccess("We've received your application"));
  assert.equal(M.isSuccess("Apply for this job. Tell us about yourself."), false);
});
