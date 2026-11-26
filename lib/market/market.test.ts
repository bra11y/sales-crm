import { test } from "node:test";
import assert from "node:assert/strict";
import { factsFor, headlinesFrom, ratesFrom, writeBrief } from "./market.ts";

test("the latest CBN rate comes with the day before and about 30 days back", () => {
  const rows = [
    { currency: "US DOLLAR", ratedate: "2026-11-26", centralrate: "1387.3883" },
    { currency: "US DOLLAR", ratedate: "2026-11-25", centralrate: "1391.7481" },
    { currency: "US DOLLAR", ratedate: "2026-10-26", centralrate: "1450.0000" },
    { currency: "EURO", ratedate: "2026-11-26", centralrate: "1600.5" },
  ];
  const [usd, eur] = ratesFrom(rows);
  assert.equal(usd.rate, 1387.3883);
  assert.equal(usd.dayBefore, 1391.7481);
  assert.equal(usd.monthAgo, 1450);
  assert.equal(eur.dayBefore, null);
});

test("only market stories are kept from a feed", () => {
  const xml = `<rss><channel><item><title><![CDATA[Naira gains as CBN sells dollars]]></title><link>https://x.ng/a</link><pubDate>Thu, 26 Nov 2026 17:50:27 +0000</pubDate></item><item><title>Academy trains journalists</title><link>https://x.ng/b</link></item></channel></rss>`;
  const h = headlinesFrom(xml, "Test");
  assert.equal(h.length, 1);
  assert.equal(h[0].title, "Naira gains as CBN sells dollars");
  assert.equal(h[0].at, "2026-11-26T17:50:27.000Z");
});

test("a brief that gives advice or invents a number is thrown away", async () => {
  const rates = ratesFrom([{ currency: "US DOLLAR", ratedate: "2026-11-26", centralrate: "1387.3883" }]);
  const reply = (text: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }))) as unknown as typeof fetch;
  const p = [{ name: "t", baseUrl: "https://x", apiKey: "k", model: "m" }];
  assert.equal(await writeBrief(rates, [], p, reply("What moved\nThe naira. You should buy dollars now.")), null);
  assert.equal(await writeBrief(rates, [], p, reply("What moved\nThe naira fell 9% today.")), null);
  const ok = await writeBrief(rates, [], p, reply("What moved\nThe official dollar rate was ₦1387.39.\nWhy it matters\nImports cost more.\nWhat to watch\nThe next CBN meeting."));
  assert.ok(ok);
  assert.match(factsFor(rates, []), /₦1387\.39/);
});
