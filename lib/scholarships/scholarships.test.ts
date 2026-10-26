import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpportunity, levelOf, parseFeed, placeOf, toFound } from "./feeds.ts";
import { cleanScholarshipPrefs, scoreScholarship } from "./fit.ts";
import { pageText, searchScholarships } from "./search.ts";

const XML = `<rss><channel>
<item><title>2027 MasterCard Scholarship at UC Berkeley (USA) | Fully Funded</title><link>https://www.scholarshipregion.com/mastercard-berkeley/</link><pubDate>Mon, 26 Oct 2026 08:46:51 +0000</pubDate>
<category><![CDATA[Masters Scholarships]]></category><category><![CDATA[Scholarships in USA]]></category><description><![CDATA[]]></description></item>
<item><title>The WACSI Next Generation Internship Programme 2027</title><link>https://www.opportunitiesforafricans.com/wacsi-2027/</link><pubDate>Mon, 26 Oct 2026 11:45:54 +0000</pubDate>
<category><![CDATA[Internships]]></category><description><![CDATA[Application Deadline: November 8, 2026 Applications are now open. WACSI is seeking interns from Benin, Ghana, and Nigeria. The post X appeared first on Y.]]></description></item>
<item><title>Top 10 Scholarships in Netherlands for International Students</title><link>https://www.scholars4dev.com/top-10/</link><category><![CDATA[List of]]></category><description>x</description></item>
<item><title>How to Leverage the End of the Year</title><link>https://opportunitydesk.org/how/</link><category><![CDATA[Our Blog]]></category><description>x</description></item>
</channel></rss>`;

test("reads feed items, keeps real opportunities and drops round-ups and blog posts", () => {
  const items = parseFeed(XML);
  assert.equal(items.length, 4);
  assert.deepEqual(items.map(isOpportunity), [true, true, false, false]);
  assert.equal(isOpportunity({ ...items[0], title: "10+ Scholarships in Canada for International Students" }), false);
  const a = toFound(items[0]);
  assert.equal(a.place, "USA");
  assert.equal(a.level, "Master's");
  assert.equal(a.fullyFunded, true);
  assert.equal(a.sharedAt, "2026-10-26");
  const b = toFound(items[1]);
  assert.equal(b.deadline, "2026-11-08");
  assert.equal(b.level, "Internship");
  assert.ok(!b.summary.includes("appeared first"));
  // A detail page adds the fields the feed leaves out.
  const c = toFound(
    items[0],
    "Host Country: United States of America\nEligible Countries: All Sub-Saharan African Countries\nDeadline: December 10, 2026\nRequirements: transcripts and two recommendation letters",
  );
  assert.equal(c.place, "United States of America");
  assert.equal(c.deadline, "2026-12-10");
  assert.deepEqual(c.needs.sort(), ["recommendation", "transcript"]);
  assert.equal(levelOf("PhD and Masters Scholarships"), "PhD, Master's");
  assert.equal(placeOf("Scholarship in the UK 2027", []), "UK");
});

test("scores like the job fit: hidden when you can't apply, then level, funding, time and documents", () => {
  const prefs = cleanScholarshipPrefs({ levels: ["Master's"], places: ["Germany"] });
  const today = "2026-10-26";
  const base = { title: "DAAD Master's Scholarship in Germany | Fully Funded", place: "Germany", eligible: "All Countries", level: "Master's", deadline: "2026-12-20", needs: ["transcript" as const] };
  const s = scoreScholarship(base, prefs, ["transcript"], today);
  assert.equal(s.hidden, null);
  assert.equal(s.band, "strong");
  assert.ok(s.reasons.includes("Fully funded") && s.reasons.includes("In a place you want"));
  assert.match(scoreScholarship({ ...base, eligible: "Ghana" }, prefs, [], today).hidden!, /Ghana only/);
  assert.equal(scoreScholarship({ ...base, eligible: "Sub-Saharan African Countries" }, prefs, [], today).hidden, null);
  assert.equal(scoreScholarship({ ...base, eligible: "The scholarships are open to 1st year Master's applicants and citizens of 143 eligible countries." }, prefs, [], today).hidden, null);
  assert.match(scoreScholarship({ ...base, deadline: "2026-10-01" }, prefs, [], today).hidden!, /passed/);
  assert.match(scoreScholarship({ ...base, level: "PhD", title: "PhD Studentship" }, prefs, [], today).hidden!, /PhD/);
  assert.match(scoreScholarship({ ...base, title: "Partial grant", level: "Master's" }, { ...prefs, fundedOnly: true }, [], today).hidden!, /fully funded/);
  assert.equal(cleanScholarshipPrefs({ levels: ["Wizard", "PhD"] }).levels.join(), "PhD");
  const mc = scoreScholarship({ ...base, title: "University of Edinburgh MasterCard Scholarship in UK", level: null }, prefs, [], today);
  assert.ok(!mc.reasons.includes("Matches the level you want"), "MasterCard is not a Master's");
});

test("the search reads feeds, stops at a page with nothing new, and saves only new posts", async () => {
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(String(url));
    if (String(url).includes("/feed/")) return new Response(String(url).includes("paged=2") ? "<rss></rss>" : XML, { status: 200 });
    return new Response("<html><article><p>Host Country: USA</p><p>Deadline: December 1, 2026</p></article></html>", { status: 200 });
  }) as unknown as typeof fetch;
  const saved: Record<string, unknown>[] = [];
  const db = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [{ url: "https://www.opportunitiesforafricans.com/wacsi-2027/" }], error: null }) }) }),
      upsert: (rows: Record<string, unknown>[]) => {
        saved.push(...rows);
        return { select: async () => ({ data: rows, error: null }) };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      table,
    }),
  } as never;
  const r = await searchScholarships(db, "u1", "manual", fetcher);
  assert.ok(r.ok);
  // The Berkeley post is new everywhere it appears; WACSI was already saved.
  assert.equal(saved.filter((s) => s.url === "https://www.opportunitiesforafricans.com/wacsi-2027/").length, 0);
  const berkeley = saved.find((s) => s.source === "scholarshipregion" && String(s.url).includes("berkeley"));
  assert.equal(berkeley?.deadline, "2026-12-01", "detail page read");
  assert.ok(
    calls.some((c) => c.includes("paged=2")),
    "reads a second page when the first was all new",
  );
  assert.equal(pageText("<script>x</script><article><p>Hi &amp; bye</p></article>"), "Hi & bye");
});
