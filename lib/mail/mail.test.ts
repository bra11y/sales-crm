import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import F from "../apply/facts.js";
import { aiProviders, checkWhy, parseAnswer, rulesWhy, writeWhy, type Provider } from "../apply/ai.ts";
import { draftApplication, emailBody, followUps } from "../apply/compose.ts";
import type { Facts } from "../jobs/facts.ts";
import { cvPdf, pdfSafe } from "../pdf/cv.ts";
import { open, readKey, seal } from "./crypto.ts";
import { findContactEmail } from "./extract.ts";
import { isAutoReply, matchReply, snippet, suggestStage } from "./reply.ts";
import { DAILY_LIMIT, followUpTimes, guessZone, inWindow, nextWindow, sendBudget } from "./schedule.ts";

const facts = F as unknown as Facts;
const job = {
  title: "Frontend Engineer (Remote)",
  company: "Kola Pay",
  description: "Kola Pay helps market traders in Lagos take card payments. You will build our merchant dashboard in React and TypeScript, and make it work with screen readers. Send your CV to hiring@kolapay.com.",
};

test("finds the apply address and skips privacy, security and accommodation addresses", () => {
  assert.deepEqual(findContactEmail(job.description)?.email, "hiring@kolapay.com");
  assert.equal(findContactEmail("If you need an accommodation during interviews, email accommodations@forhims.com."), null);
  assert.equal(findContactEmail("Report a vulnerability to security@linear.app."), null);
  assert.equal(findContactEmail("Questions about your personal data? privacy@trmlabs.com"), null);
  assert.equal(findContactEmail("Apply here, or email support@clickup.com if the form breaks."), null);
  assert.equal(findContactEmail("Our office is at hello@acme.com."), null);
  assert.equal(findContactEmail("To request assistance with the application process, please email talentacquisition@workiva.com."), null);
  assert.equal(findContactEmail("To apply, email jobs@fueled.com with your portfolio.")?.email, "jobs@fueled.com");
});

test("guesses the employer's time zone from the location", () => {
  assert.equal(guessZone("USA only"), "America/New_York");
  assert.equal(guessZone("Remote - San Francisco, CA"), "America/Los_Angeles");
  assert.equal(guessZone("United Kingdom"), "Europe/London");
  assert.equal(guessZone("EMEA"), "Europe/Berlin");
  assert.equal(guessZone("Worldwide"), "Africa/Lagos");
});

test("sends only on weekdays 08:00 to 18:00 in the employer's zone", () => {
  const tueNoonNY = new Date("2026-10-20T16:00:00Z");
  assert.equal(inWindow(tueNoonNY, "America/New_York"), true);
  const tueNightNY = new Date("2026-10-21T02:00:00Z"); // 22:00 Tuesday in New York
  assert.equal(inWindow(tueNightNY, "America/New_York"), false);
  assert.equal(nextWindow(tueNightNY, "America/New_York").toISOString(), "2026-10-21T12:10:00.000Z");
  const satLagos = new Date("2026-10-24T10:00:00Z");
  assert.equal(nextWindow(satLagos, "Africa/Lagos").toISOString(), "2026-10-26T07:10:00.000Z");
});

test("follow-ups land 5 and 10 days later, inside the window", () => {
  const [a, b] = followUpTimes(new Date("2026-10-20T16:00:00Z"), "America/New_York");
  assert.equal(a.toISOString(), "2026-10-26T12:10:00.000Z"); // Sunday 25th moves to Monday
  assert.equal(b.toISOString(), "2026-10-30T16:00:00.000Z");
});

test("keeps to the daily limit and the gap between sends", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  assert.deepEqual(sendBudget([], now), { ok: true });
  const r = sendBudget([new Date(now.getTime() - 5_000)], now);
  assert.equal(r.ok, false);
  const full = Array.from({ length: DAILY_LIMIT }, (_, i) => new Date(now.getTime() - (i + 1) * 60_000));
  const f = sendBudget(full, now);
  assert.equal(!f.ok && f.reason, "daily_limit");
});

test("reads replies: thread match, stage and auto-replies", () => {
  const sent = [{ id: "o1", messageId: "<abc@gmail.com>", toEmail: "hiring@kolapay.com" }];
  assert.equal(matchReply({ messageId: "x", from: "ada@kolapay.com", subject: "Re: hi", text: "", inReplyTo: "<abc@gmail.com>" }, sent)?.id, "o1");
  assert.equal(matchReply({ messageId: "x", from: "jane@kolapay.com", subject: "Your application", text: "" }, sent)?.id, "o1");
  assert.equal(matchReply({ messageId: "x", from: "friend@gmail.com", subject: "lunch", text: "" }, sent), null);
  assert.equal(suggestStage("Re: Application", "Could we schedule a call next week?"), "interview");
  assert.equal(suggestStage("Re: Application", "Unfortunately we decided to move forward with other candidates. We may call you later."), "closed");
  assert.equal(suggestStage("Re: Application", "Thanks, got it."), "replied");
  assert.equal(isAutoReply({ subject: "Automatic reply: Application", text: "" }), true);
  assert.equal(isAutoReply({ subject: "Re: Application", text: "Hi", autoSubmitted: "auto-replied" }), true);
  assert.equal(snippet("Sounds good!\n\nOn Tue, 20 Oct 2026, Bryan wrote:\n> old text"), "Sounds good!");
});

test("locks and unlocks the app password", () => {
  const key = randomBytes(32);
  const sealed = seal("abcd efgh ijkl mnop", key);
  assert.notEqual(sealed.ciphertext, "abcd efgh ijkl mnop");
  assert.equal(open(sealed, key), "abcd efgh ijkl mnop");
  assert.throws(() => open({ ...sealed, tag: randomBytes(16).toString("base64") }, key));
  assert.equal(readKey("short"), null);
  assert.equal(readKey(key.toString("base64"))?.length, 32);
});

test("the free provider goes first, the Gateway second", () => {
  const list = aiProviders({ FREE_AI_BASE_URL: "https://api.groq.com/openai/v1/", FREE_AI_API_KEY: "k", FREE_AI_MODEL: "openai/gpt-oss-20b", VERCEL_OIDC_TOKEN: "t" });
  assert.deepEqual(list.map((p) => p.name), ["free", "gateway"]);
  assert.equal(list[0].baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(aiProviders({}).length, 0);
});

test("the fact check stops invented names, numbers and tools", () => {
  const ok = "I want to help Kola Pay make its merchant dashboard work for traders who use screen readers. My React and accessibility work fits what your post asks for.";
  assert.equal(checkWhy(ok, job, facts), "");
  assert.match(checkWhy("I want to help Kola Pay grow revenue by 40% for traders who use screen readers in their shops today.", job, facts), /number 40%/);
  assert.match(checkWhy("I want to help Kola Pay, which Stripe backs, serve traders who use screen readers in their shops every day.", job, facts), /"Stripe"/);
  const gap = facts.gaps[0];
  assert.match(checkWhy(`I want to help Kola Pay serve traders, and my ${gap} work fits the dashboard your post describes well.`, job, facts), /not used|not in the job post/);
  assert.match(checkWhy("I am passionate about helping Kola Pay serve traders who use screen readers in the busy markets of Lagos.", job, facts), /AI-sounding/);
});

test("parses the model's JSON even with extra text around it", () => {
  assert.deepEqual(parseAnswer('Sure! {"why": " Two  sentences. ", "manager": "Ada Obi"}'), { why: "Two sentences.", manager: "Ada Obi" });
  assert.equal(parseAnswer("no json"), null);
});

const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const providers: Provider[] = [
  { name: "free", baseUrl: "https://free.test/v1", apiKey: "k", model: "m1" },
  { name: "gateway", baseUrl: "https://gw.test/v1", apiKey: "k", model: "m2" },
];

test("falls through to the next provider when one is out of credit", async () => {
  const good = '{"why": "I want to help Kola Pay make its merchant dashboard work for traders who use screen readers. My React and accessibility work fits what your post asks for.", "manager": ""}';
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    return url.startsWith("https://free.test") ? new Response("rate limited", { status: 429 }) : reply(good);
  }) as unknown as typeof fetch;
  const w = await writeWhy(job, facts, ["React", "Accessibility"], providers, fetcher);
  assert.equal(w.source, "ai");
  assert.match(w.provider!, /gateway/);
  assert.equal(calls.length, 2);
});

test("retries once with the failed check, then uses the plain sentence", async () => {
  const bad = '{"why": "I want to help Kola Pay grow 300% with my Kubernetes, Stripe and Salesforce work for traders across the country.", "manager": "Nobody Named"}';
  const bodies: string[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return reply(bad);
  }) as unknown as typeof fetch;
  const w = await writeWhy(job, facts, ["React"], [providers[1]], fetcher);
  assert.equal(w.source, "rules");
  assert.equal(bodies.length, 2);
  assert.match(bodies[1], /failed this check/);
  assert.equal(w.why, rulesWhy(job, ["React"]));
  assert.equal(w.manager, "");
});

test("with AI off, the plain sentence is used at no cost", async () => {
  const w = await writeWhy(job, facts, ["React"], [], (() => assert.fail("no call")) as unknown as typeof fetch);
  assert.equal(w.source, "rules");
});

test("drafts the full email: subject, letter body, CV and follow-ups", () => {
  const why = rulesWhy(job, ["React"]);
  const d = draftApplication(job, { ...facts, person: { ...facts.person, email: "bryanonyenghan@gmail.com" } }, why);
  assert.equal(d.subject, `Application: Frontend Engineer | ${facts.person.name}`);
  assert.match(d.body, /^Hi Kola Pay team,/);
  assert.match(d.body, /My CV is attached as a PDF\.\n\nWarm regards,/);
  assert.doesNotMatch(d.body, /\]\(/);
  assert.match(d.cv, /bryanonyenghan@gmail\.com/);
  assert.match(d.cover, /I want to bring my React work to Kola Pay/);
  assert.deepEqual(d.problems, []);
  const noCompany = draftApplication({ ...job, company: "" }, facts, why);
  assert.ok(noCompany.problems.length > 0);
  const [one, two] = followUps(facts, { role: "Frontend Engineer", company: "Kola Pay", manager: "", matched: d.matched, sentAt: new Date("2026-10-20T16:00:00Z") });
  assert.match(one, /^Hi Kola Pay team,\n\nI applied for the Frontend Engineer role on 20 October/);
  assert.match(two, /If the role is filled, no need to reply\./);
});

test("the email body drops the letterhead and keeps links readable", () => {
  const body = emailBody("<!-- kind: letter -->\n\n# Name\n\nme@x.com | [Portfolio](https://p.dev)\n\nHi Ada,\n\nSee [my work](https://p.dev/a).\n\nWarm regards,\nName\n");
  assert.equal(body, "Hi Ada,\n\nSee my work: https://p.dev/a.\n\nMy CV is attached as a PDF.\n\nWarm regards,\nName\n");
});

test("renders the CV to a real PDF with safe characters", async () => {
  const d = draftApplication(job, facts, rulesWhy(job, ["React"]));
  const pdf = await cvPdf(d.cv, "CV");
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), "%PDF-");
  assert.ok(pdf.length > 2000);
  assert.equal(pdfSafe("A – B — “C” ₦5 →"), "A - B - \"C\" NGN 5 ->");
});

test("the letter quotes the post's own words, never a skill the post did not name", () => {
  const d = draftApplication(job, facts, rulesWhy(job, ["React"]));
  assert.doesNotMatch(d.cover, /asks for Paystack/);
  assert.match(d.cover, /Your post asks for payments/);
});
