import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCapture, httpsLink, parseCapture, postedDate, readCapture, toPost } from "./capture.ts";

const NOW = new Date("2026-10-24T09:00:00Z");
const answer = {
  title: "Senior Accessibility Engineer",
  company: "Kola Pay",
  location: "Remote (Africa)",
  pay: "$4,000 - $5,000 a month",
  employmentType: "Full-time",
  link: "kolapay.com/careers/a11y",
  email: "",
  posted: "3 days ago",
  description: "Lead WCAG 2.2 audits across our web and mobile apps.",
  seen: "Kola Pay is hiring Senior Accessibility Engineer Remote (Africa) $4,000 - $5,000 a month Full-time 3 days ago Lead WCAG 2.2 audits",
};

test("a screenshot answer becomes a job post with a real link, pay and date", () => {
  const c = parseCapture("Here you go:\n" + JSON.stringify(answer));
  assert.ok(c);
  assert.equal(checkCapture(c), "");
  const p = toPost(c, {}, NOW);
  assert.equal(p.source, "capture");
  assert.equal(p.url, "https://kolapay.com/careers/a11y");
  assert.equal(p.pay?.max, 5000);
  assert.equal(p.postedAt, "2026-10-21T09:00:00.000Z");
  assert.deepEqual(p.restrictions, ["Africa"]);
  // The same job shared twice lands on the same row.
  assert.equal(toPost(c, {}, NOW).externalId, p.externalId);
});

test("without a link the job searches for itself, and a link you type wins", () => {
  const c = parseCapture(JSON.stringify({ ...answer, link: "" }))!;
  assert.match(toPost(c, {}, NOW).url, /^https:\/\/www\.google\.com\/search\?q=Senior/);
  assert.equal(toPost(c, { link: "http://jobs.lever.co/kola/1" }, NOW).url, "https://jobs.lever.co/kola/1");
  assert.equal(httpsLink("javascript:alert(1)"), null);
  assert.equal(httpsLink("not a link"), null);
});

test("a title or company the model made up is caught", () => {
  assert.match(checkCapture({ ...parseCapture(JSON.stringify(answer))!, company: "Flutterwave" }), /company/);
  assert.match(checkCapture({ ...parseCapture(JSON.stringify(answer))!, title: "Chief Design Officer" }), /title/);
  assert.equal(parseCapture(JSON.stringify({ ...answer, title: "" })), null);
  assert.equal(postedDate("yesterday", NOW), "2026-10-23T09:00:00.000Z");
  assert.equal(postedDate("2w", NOW), "2026-10-10T09:00:00.000Z");
  assert.equal(postedDate("soon", NOW), null);
});

test("the image goes to the model, a bad read is retried, then it falls back", async () => {
  const sent: unknown[] = [];
  let call = 0;
  const fetcher = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    call++;
    const body = call === 1 ? { ...answer, company: "Made Up Ltd" } : answer;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }));
  }) as typeof fetch;
  const r = await readCapture({ image: "data:image/jpeg;base64,AAAA" }, [{ name: "gateway", baseUrl: "https://x", apiKey: "k", model: "m" }], fetcher, NOW);
  assert.ok(r.ok);
  assert.equal(call, 2);
  const msg = (sent[0] as { messages: { content: unknown }[] }).messages[1].content as { type: string }[];
  assert.deepEqual(
    msg.map((p) => p.type),
    ["text", "image_url"],
  );
  assert.equal((await readCapture({}, [], fetcher)).ok, false);
});
