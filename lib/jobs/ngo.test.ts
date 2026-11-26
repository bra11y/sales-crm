import { test } from "node:test";
import assert from "node:assert/strict";
import { closingDate, ngoLinks, parseReliefWeb, parseReliefWebApi, reliefwebUrls } from "./ngo.ts";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const item = (id: number, title: string, country: string, org: string, closes: string, body: string) => `<item>
  <title>${title}</title>
  <link>https://reliefweb.int/job/${id}/x</link>
  <pubDate>Thu, 26 Nov 2026 16:44:46 +0000</pubDate>
  <description>&lt;div class="tag country"&gt;Country: ${country}&lt;/div&gt;&lt;div class="tag source"&gt;Organization: ${org}&lt;/div&gt;&lt;div class="date closing"&gt;Closing date: ${closes}&lt;/div&gt;&lt;p&gt;${body}&lt;/p&gt;</description>
  <category>${country}</category><category>${org}</category><category>Advocacy/Communications</category><category>Job</category>
</item>`;

test("ReliefWeb feed items become jobs with the country, organisation and closing date", () => {
  const feed = `<rss><channel>${item(1, "SAFETY &amp; SECURITY OFFICER _ BORNO STATE", "Nigeria", "INTERSOS", "30 Nov 2026", "Field security.")}${item(2, "Digital Officer", "Kenya", "UNDP", "2 Dec 2026", "This is a home-based role.")}${item(3, "Old job", "Chad", "WFP", "1 Nov 2026", "Closed.")}</channel></rss>`;
  const jobs = parseReliefWeb(feed, NOW);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].title, "SAFETY & SECURITY OFFICER - BORNO STATE");
  assert.equal(jobs[0].company, "INTERSOS");
  assert.equal(jobs[0].location, "Nigeria");
  assert.deepEqual(jobs[0].restrictions, ["Nigeria"]);
  assert.match(jobs[0].description, /^Closing date: 2026-11-30\n\nField security\./);
  assert.equal(jobs[0].description.match(/Closing date/g)!.length, 1);
  assert.deepEqual(jobs[0].tags, ["NGO", "Advocacy/Communications"]);
  assert.equal(jobs[1].location, "Remote (Kenya)");
  assert.deepEqual(jobs[1].restrictions, []);
});

test("the API answer is read too, and old posts are dropped", () => {
  const body = JSON.stringify({
    data: [
      { id: 9, fields: { title: "MEAL Officer", "body-html": "<p>Work in Maiduguri.</p>", url: "https://reliefweb.int/job/9", date: { created: "2026-11-25T10:00:00+00:00", closing: "2026-12-10T00:00:00+00:00" }, source: [{ name: "IRC" }], country: [{ name: "Nigeria" }], type: [{ name: "Job" }], career_categories: [{ name: "Monitoring and Evaluation" }] } },
      { id: 10, fields: { title: "Closed", date: { closing: "2026-10-01T00:00:00+00:00" } } },
    ],
  });
  const jobs = parseReliefWebApi(body, NOW);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, "IRC");
  assert.match(jobs[0].description, /^Closing date: 2026-12-10/);
});

test("with an app name the API is used; without one, the public feed", () => {
  assert.match(reliefwebUrls("crm-app", ["Communications"])[1], /^https:\/\/api\.reliefweb\.int\/v2\/jobs\?appname=crm-app.*query%5Bvalue%5D=Communications/);
  assert.match(reliefwebUrls("crm-app", [])[0], /filter%5Bvalue%5D=nga/);
  assert.deepEqual(reliefwebUrls(undefined, ["UX"]), ["https://reliefweb.int/jobs/rss.xml?advanced-search=%28C175%29", "https://reliefweb.int/jobs/rss.xml?search=UX"]);
  assert.equal(closingDate("Closing date: 2 Dec 2026"), "2026-12-02");
  assert.ok(ngoLinks("Communications Officer").every((l) => l.url.startsWith("https://") && l.url.includes("Communications%20Officer")));
});
