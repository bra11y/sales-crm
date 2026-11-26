import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRewrite, humanizeLetter, parseBody, splitLetter } from "./humanize.ts";

const before = `Hi Acme team,

Your post asks for React, WCAG and screen reader testing. Here is that work, with proof.

- React. I rebuilt the WashCare booking flow in React and cut drop-off by 18%.
- WCAG. I audited 40 pages against WCAG 2.2 AA for Bihub.

I want to help Acme make its checkout work for everyone who uses it.

You can see my work in my portfolio: https://bryan.dev. Could we talk for 20 minutes next week?

My CV is attached as a PDF.

Best,
Bryan Onyenghan
`;

const after = `Hi Acme team,

You need someone who can build in React and test with a screen reader. I rebuilt the WashCare booking flow in React, and fewer people dropped off: 18% fewer. For Bihub I audited 40 pages against WCAG 2.2 AA and fixed what failed.

I'd like to do the same for the Acme checkout, so everyone who uses it can finish paying.

My work is in my portfolio: https://bryan.dev. Could we talk for 20 minutes next week?

My CV is attached as a PDF.

Best,
Bryan Onyenghan
`;

test("a rewrite that keeps every fact and adds none passes", () => {
  assert.equal(checkRewrite(before, after), "");
  assert.equal(splitLetter(before).tail.startsWith("My CV is attached as a PDF."), true);
});

test("dashes, curly quotes and non-breaking hyphens from the model are made plain", () => {
  assert.equal(parseBody(JSON.stringify({ body: "Every user \u2013 including screen\u2011reader users \u2013 can pay. \u201cYes\u201d, it\u2019s done." })), 'Every user, including screen-reader users, can pay. "Yes", it\'s done.\n');
});

test("a rewrite that adds a number, a name or a link, or drops one, fails", () => {
  assert.match(checkRewrite(before, after.replace("18%", "25%")), /number 25/);
  assert.match(checkRewrite(before, after.replace("For Bihub", "For Google")), /"Google"/);
  assert.match(checkRewrite(before, after.replace("https://bryan.dev", "my site")), /Keep the link/);
  assert.match(checkRewrite(before, after.replace("Hi Acme team,", "Dear Acme,")), /first line/);
  assert.match(checkRewrite(before, after.replace("My CV is attached as a PDF.", "CV attached.")), /Keep this line/);
  assert.match(checkRewrite(before, after.replace("I'd like to do", "I am passionate to do")), /AI-sounding/);
});

test("the plain letter is kept when AI is off or every draft fails", async () => {
  const off = await humanizeLetter(before, "", []);
  assert.equal(off.source, "rules");
  assert.equal(off.body, before);
  const reply = (body: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ body }) } }] }))) as unknown as typeof fetch;
  const main = splitLetter(after).main;
  const bad = reply(main.replace("18%", "99%"));
  const r = await humanizeLetter(before, "", [{ name: "t", baseUrl: "https://x", apiKey: "k", model: "m" }], bad);
  assert.equal(r.source, "rules");
  assert.match(r.note!, /number 99/);
  const ok = await humanizeLetter(before, "I write short.", [{ name: "t", baseUrl: "https://x", apiKey: "k", model: "m" }], reply(main));
  assert.equal(ok.source, "ai");
  assert.equal(ok.body, `${main.trimEnd()}\n\n${splitLetter(before).tail}`);
  const signed = await humanizeLetter(before, "", [{ name: "t", baseUrl: "https://x", apiKey: "k", model: "m" }], reply(`${main}\nBest,\nBryan`));
  assert.match(signed.note!, /sign-off/);
  assert.equal(parseBody("nothing"), null);
});
