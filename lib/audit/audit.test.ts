import { test } from "node:test";
import assert from "node:assert/strict";
import { auditHtml } from "./check.ts";
import { pitch } from "./pitch.ts";

const BAD = `<html><head><meta name="viewport" content="width=device-width, maximum-scale=1"></head><body>
<h2>Shop</h2><img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg">
<form><input type="email" placeholder="Email"><label for="n">Name</label><input id="n"><label>Phone <input type="tel"></label><input type="hidden"></form>
<a href="/cart"><svg></svg></a><button></button><button aria-label="Menu"></button><a href="/">Home</a>
<h4>Deals</h4><video autoplay src="x.mp4"></video></body></html>`;

const GOOD = `<html lang="en"><head><title>Acme</title><meta name="viewport" content="width=device-width"></head><body><h1>Acme</h1><h2>Shop</h2><img src="a.jpg" alt="Blue shoe"><label for="e">Email</label><input id="e" type="email"><a href="/cart" aria-label="Cart"><svg></svg></a></body></html>`;

test("finds the problems a machine can prove, and counts them", () => {
  const a = auditHtml(BAD);
  const by = Object.fromEntries(a.findings.map((f) => [f.id, f.count]));
  assert.deepEqual(by, { alt: 2, labels: 1, names: 2, zoom: 1, lang: 1, autoplay: 1, title: 1, h1: 1, skips: 1 });
  assert.ok(a.score < 40, `score ${a.score}`);
  assert.equal(a.findings[0].id, "alt");
});

test("a clean page scores 100 with nothing to report", () => {
  const a = auditHtml(GOOD);
  assert.deepEqual(a.findings, []);
  assert.equal(a.score, 100);
  assert.equal(a.title, "Acme");
});

test("the pitch names real findings, stays short, and lets them opt out", () => {
  const { subject, body } = pitch("Acme", "https://www.acme.com/shop", auditHtml(BAD).findings, { name: "Bryan", brand: "Mr Accessibility", portfolio: "https://p.dev", cpacc: "yes" }, "Ada Obi");
  assert.equal(subject, "3 accessibility issues on acme.com");
  assert.match(body, /^Hi Ada,/);
  assert.match(body, /2 images with no alt text/);
  assert.match(body, /reply "no" and I won't write again/);
  assert.ok(body.split(/\s+/).length < 170, `${body.split(/\s+/).length} words`);
  const one = pitch("Acme", "acme.com", auditHtml(GOOD.replace(' lang="en"', "")).findings, { name: "B" });
  assert.match(one.body, /one thing that stops/);
  assert.match(one.body, /It's a quick fix, and it also lowers/);
});

test("only public https sites can be checked", async () => {
  const { siteUrl } = await import("./fetch.ts");
  assert.equal(siteUrl("acme.com/shop")?.toString(), "https://acme.com/shop");
  assert.equal(siteUrl("http://acme.com")?.protocol, "https:");
  for (const bad of ["localhost:3000", "http://127.0.0.1", "https://10.0.0.5", "https://user:pw@acme.com", "intranet", "https://[::1]/"]) assert.equal(siteUrl(bad), null, bad);
});
