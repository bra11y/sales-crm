import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuote, checkRef, plain, postParts, readDraft } from "./post.ts";

const fake = (routes: Record<string, { status: number; body: string }>) =>
  (async (url: string | URL | Request) => {
    const u = String(url);
    const hit = Object.entries(routes).find(([k]) => u.includes(k));
    return new Response(hit ? hit[1].body : "", { status: hit ? hit[1].status : 404 });
  }) as typeof fetch;

test("reads a draft, drops posts too long for X and cleans dashes", () => {
  const d = readDraft('{"text":"Your brain rewires with practice — every day.","thread":["One","Two"],"quote":{"text":"“We are what we repeatedly do.”","author":"Will Durant"},"wikipedia":"Neuroplasticity"}');
  assert.equal(d?.text, "Your brain rewires with practice, every day.");
  assert.equal(d?.quote?.text, "We are what we repeatedly do.");
  assert.equal(readDraft(JSON.stringify({ text: "x".repeat(300) })), null);
});

test("keeps a quote only when its words are on the author's Wikiquote page", async () => {
  const f = fake({ "title=Seneca_the_Younger": { status: 200, body: "== Quotes ==\n* ''Luck is what happens when [[preparation]] meets opportunity.''" } });
  const ok = await checkQuote({ text: "Luck is what happens when preparation meets opportunity.", author: "Seneca the Younger" }, f);
  assert.equal(ok?.url, "https://en.wikiquote.org/wiki/Seneca_the_Younger");
  assert.equal(await checkQuote({ text: "Something he never said at all, really.", author: "Seneca the Younger" }, f), null);
  assert.equal(await checkQuote({ text: "Luck is what happens when preparation meets opportunity.", author: "Nobody Real" }, f), null);
  assert.equal(plain("[[a|Hello]], World!"), "helloworld");
});

test("keeps a reference only when Wikipedia has the article", async () => {
  const f = fake({
    "summary/Entropy": { status: 200, body: JSON.stringify({ type: "standard", title: "Entropy", content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Entropy" } } }) },
    "summary/Mercury": { status: 200, body: JSON.stringify({ type: "disambiguation", content_urls: { desktop: { page: "x" } } }) },
  });
  assert.equal((await checkRef("Entropy", f))?.url, "https://en.wikipedia.org/wiki/Entropy");
  assert.equal(await checkRef("Mercury", f), null);
  assert.equal(await checkRef("Made up page", f), null);
});

test("the parts to paste put the quote and reference after the post", () => {
  const parts = postParts({ topic: "Entropy", slug: "science-entropy", text: "Main", thread: ["Reply"], quote: { text: "Q", author: "A", url: "u" }, refs: [{ title: "Entropy", url: "https://en.wikipedia.org/wiki/Entropy" }], from: "x" });
  assert.deepEqual(parts, ["Main", "Reply", '"Q" (A)', "Read more: https://en.wikipedia.org/wiki/Entropy"]);
});

test("follows Wikiquote redirects and ignores misattributed and disputed lines", async () => {
  const f = fake({
    "title=Seneca&": { status: 200, body: "#REDIRECT [[Seneca the Younger]]" },
    "title=Seneca_the_Younger": { status: 200, body: "== Quotes ==\n* We suffer more often in imagination than in reality.\n== Misattributed ==\n* Luck is what happens when preparation meets opportunity." },
  });
  const ok = await checkQuote({ text: "We suffer more often in imagination than in reality.", author: "Seneca" }, f);
  assert.equal(ok?.author, "Seneca the Younger");
  assert.equal(await checkQuote({ text: "Luck is what happens when preparation meets opportunity.", author: "Seneca" }, f), null);
});
