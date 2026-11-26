import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanQuestions, feeOf, isConference, toConference, warningsFor, X_PICKS } from "./conferences.ts";
import { checkAnswer, parseAnswerJson } from "./answers.ts";

const item = (title: string, summary = "", categories: string[] = []) => ({ title, url: "https://example.org/x", published: "2026-11-20", categories, summary });

test("conferences and summits are kept; scholarships, jobs and round-ups are not", () => {
  assert.ok(isConference(item("Leadership and Peace Summit Morocco 2027 (Fully Funded)")));
  assert.ok(isConference(item("Commonwealth Study Conferences Australia 2027", "", ["Conferences"])));
  assert.ok(isConference(item("Youth Assembly at the United Nations 2027")));
  assert.equal(isConference(item("Chevening Scholarships 2027")), false);
  assert.equal(isConference(item("Commonwealth Youth Council 2026 Executive Elections: Online Nominations Open")), false);
  assert.equal(isConference(item("Top 10 fully funded conferences in 2027")), false);
});

test("the fee to apply is read with its amount, and warnings say what it costs you", () => {
  const body = "Fully funded seats are limited. A non-refundable application fee of $17 is paid on submission. Airfare is reimbursed after the event.";
  const fee = feeOf(body);
  assert.match(fee, /^\$17:/);
  const w = warningsFor(body, fee);
  assert.ok(w.some((x) => /not refunded/.test(x)));
  assert.ok(w.some((x) => /paid back after you travel/.test(x)));
  assert.equal(feeOf("Fully funded: flights, hotel and meals are covered."), "");
  assert.deepEqual(warningsFor("Fully funded: flights, hotel and meals.", ""), []);
});

test("a feed item becomes a conference with its deadline and place", () => {
  const c = toConference(item("World Leaders Convention 2027 in Austria (Fully Funded)", "Deadline: 29 November 2026\nBenefits: Flight, hotel and meals\nEligibility: Ages 18 to 35"));
  assert.equal(c.name, "World Leaders Convention 2027 in Austria");
  assert.equal(c.deadline, "2026-11-29");
  assert.equal(c.place, "Austria");
  assert.equal(c.covers, "Flight, hotel and meals");
  assert.equal(c.eligible, "Ages 18 to 35");
});

test("the four shared on X each show a fee and their form's questions", () => {
  assert.equal(X_PICKS.length, 4);
  for (const p of X_PICKS) {
    assert.ok(p.fee, p.name);
    assert.ok(p.warnings.length, p.name);
    assert.ok(p.questions.length, p.name);
    assert.match(p.url, /^https:\/\//);
  }
});

test("questions are cleaned: empty ones dropped, limits kept, answers trimmed", () => {
  const q = cleanQuestions([{ q: " Why? ", limit: "250", answer: " Because. ", source: "you" }, { q: "" }, "junk"]);
  assert.deepEqual(q, [{ q: "Why?", limit: 250, answer: "Because.", source: "you" }]);
  assert.deepEqual(cleanQuestions(null), []);
});

test("a drafted answer must stay in its limit and invent nothing", () => {
  const known = "Bryan builds accessible websites for WashCare in Abuja. Audited 40 pages. CPACC.";
  const q = { q: "Why attend?", limit: 60, answer: "" };
  const good =
    "I audit websites so people who use screen readers can book and pay without help. At WashCare in Abuja I audited 40 pages and fixed what blocked them. I want to learn how other countries write these rules into law, then bring that back to the teams I work with.";
  assert.equal(checkAnswer(good, q, known), "");
  assert.match(checkAnswer(good.replace("40", "400"), q, known), /number 400/);
  assert.match(checkAnswer(good.replace("WashCare", "Google"), q, known), /"Google"/);
  assert.match(checkAnswer(`${good} ${good}`, q, known), /under 60 words/);
  assert.match(checkAnswer(good.replace("I want to learn", "I am passionate to learn"), q, known), /AI-sounding/);
  assert.equal(parseAnswerJson('Sure: {"answer": "Hello there."}'), "Hello there.");
  assert.equal(parseAnswerJson("no json"), null);
});

test("titles lose the 'Fully Funded' tag; fellowships and month-long programmes are not conferences", () => {
  const c = toConference(item("European Youth Summit 2027 in Spain | Fully Funded Conference", "This summit will take place in Madrid, Spain, from 13–16 April 2027."));
  assert.equal(c.name, "European Youth Summit 2027 in Spain");
  assert.equal(c.place, "Spain");
  assert.equal(c.dates, "13–16 April 2027");
  assert.equal(isConference(item("The Acumen Green RISE East Africa Fellowship 2027 (6-month leadership program)", "", ["Conferences"])), false);
});
