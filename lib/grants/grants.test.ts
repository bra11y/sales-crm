import { test } from "node:test";
import assert from "node:assert/strict";
import { amountOf, cleanAnswer, isBusinessGrant, scoreGrant, toGrant } from "./grants.ts";
import { searchGrants } from "./search.ts";
import type { FeedItem } from "../scholarships/feeds.ts";

const item = (title: string, summary = "", categories: string[] = []): FeedItem => ({ title, url: "https://opportunitydesk.org/x/", published: "2026-11-10", categories, summary });

test("keeps business grants and drops scholarships, story grants and civil-society calls", () => {
  assert.equal(isBusinessGrant(item("Zoom AI Launchpad Startup Grants 2027")), true);
  assert.equal(isBusinessGrant(item("Tony Elumelu Foundation Entrepreneurship Programme 2027 for African Entrepreneurs ($5,000 seed capital)")), true);
  assert.equal(isBusinessGrant(item("CitizensNYC Neighborhood Business Grant 2027 (up to $5,000)")), true);
  assert.equal(isBusinessGrant(item("MSME Survival Fund for Nigerian small businesses")), true);
  assert.equal(isBusinessGrant(item("EJN Story Grants to Report on Mining, Environment and Human Rights in Africa 2027 (up to $2,000)")), false);
  assert.equal(isBusinessGrant(item("Council of Europe Grants for Civil Society Organisations 2026 (up to €20,000)")), false);
  assert.equal(isBusinessGrant(item("Chevening Scholarships 2027 for Masters in the UK")), false);
  assert.equal(isBusinessGrant(item("How to Win a Startup Grant: 10 Tips")), false);
  assert.equal(isBusinessGrant(item("Busamed Nursing Bursary 2027: Funding Opportunity for Unemployed Nursing Students")), false);
  assert.equal(isBusinessGrant(item("New America Fellows Program Class of 2028 (up to $30,000)", "for entrepreneurs and writers")), false);
  assert.equal(isBusinessGrant(item("Fast Retailing Global Management Program 2027", "for future business leaders")), false);
});

test("reads the amount, deadline and who can apply", () => {
  assert.equal(amountOf("CitizensNYC Neighborhood Business Grant 2027 (up to $5,000)"), "up to $5,000");
  assert.equal(amountOf("Win ₦10,000,000 in grants and loans"), "₦10,000,000");
  assert.equal(amountOf("EY Step Into Business: a £2,000 Startup Grant"), "£2,000");
  assert.equal(amountOf("A grant for founders"), "");
  const g = toGrant(item("Africa Startup Prize 2027 for African Entrepreneurs ($25,000)", "Application Deadline: December 15, 2026\nEligibility: Founders from any African country"));
  assert.equal(g.amount, "$25,000");
  assert.equal(g.deadline, "2026-12-15");
  assert.equal(g.eligible, "Founders from any African country");
  assert.equal(toGrant(item("Nigerian Women in Business Grant")).eligible, "Nigeria");
});

const lead = (title: string, extra: Partial<Parameters<typeof scoreGrant>[0]> = {}) => ({ title, eligible: null, amount: null, deadline: null, summary: null, ...extra });

test("hides grants you cannot get and ranks Nigerian and African ones first", () => {
  const today = "2026-11-18";
  assert.match(scoreGrant(lead("Old Grant", { deadline: "2026-11-01" }), today).hidden!, /deadline has passed/);
  assert.match(scoreGrant(lead("CitizensNYC Neighborhood Business Grant 2027"), today).hidden!, /New York/);
  assert.match(scoreGrant(lead("EY Foundation Step Into Business Programme 2027", { eligible: "UK residents" }), today).hidden!, /UK/);
  assert.match(scoreGrant(lead("Birmingham International Academy, Future Makers Challenge 2027"), today).hidden!, /UK/);
  assert.match(scoreGrant(lead("Step Into Business Programme", { summary: "Open to young people living in London and Manchester." }), today).hidden!, /UK/);
  assert.equal(scoreGrant(lead("Commonwealth Climate Business Grant", { eligible: "All 56 Commonwealth countries" }), today).hidden, null);
  const ng = scoreGrant(lead("Lagos SME Grant for Nigerian businesses ($2,000)", { amount: "$2,000", deadline: "2026-12-20" }), today);
  const af = scoreGrant(lead("Africa Startup Prize for African founders"), today);
  const world = scoreGrant(lead("Zoom AI Launchpad Startup Grants 2027"), today);
  assert.equal(ng.hidden, null);
  assert.ok(ng.score > af.score && af.score > world.score, `${ng.score} > ${af.score} > ${world.score}`);
  assert.ok(ng.reasons.includes("Open to Nigerian businesses"));
  const soon = scoreGrant(lead("Nigeria Founders Fund", { deadline: "2026-11-21" }), today);
  assert.ok(soon.reasons.some((r) => /3 days left/.test(r)));
  assert.ok(scoreGrant(lead("Grant for women-led businesses in Africa"), today).reasons.includes("Check: it may be for women-led businesses only"));
});

test("cleans an answer for the answer bank", () => {
  assert.deepEqual(cleanAnswer({ question: "  What does your business do? ", answer: " We build. ", business: "Bihub Technology" }), {
    ok: true,
    value: { question: "What does your business do?", answer: "We build.", business: "Bihub Technology" },
  });
  assert.equal(cleanAnswer({ question: "", answer: "x" }).ok, false);
  assert.equal(cleanAnswer({ question: "Q", answer: "" }).ok, false);
});

const RSS = (items: string) => `<rss><channel>${items}</channel></rss>`;
const rssItem = (title: string, link: string, body = "") => `<item><title>${title}</title><link>${link}</link><pubDate>Tue, 17 Nov 2026 08:00:00 +0000</pubDate><description><![CDATA[${body}]]></description></item>`;

test("the search reads the feeds, keeps only new business grants and saves them", async () => {
  const saved: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [{ url: "https://opportunitydesk.org/old-grant/" }], error: null }) }) }),
      upsert: (rows: Record<string, unknown>[]) => {
        saved.push(...rows);
        return { select: async () => ({ data: rows.map((_, i) => ({ id: String(i) })), error: null }) };
      },
    }),
  };
  const fetcher = (async (url: string) => {
    const body = String(url).includes("opportunitydesk.org/category/grants")
      ? RSS(
          rssItem("Nigeria Startup Grant 2027 ($3,000)", "https://opportunitydesk.org/ng-startup/", "Application Deadline: January 10, 2027") +
            rssItem("Old SME Grant", "https://opportunitydesk.org/old-grant/") +
            rssItem("Chevening Scholarships 2027", "https://opportunitydesk.org/chevening/"),
        )
      : RSS("");
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  const r = await searchGrants(db as never, "user-1", fetcher);
  assert.equal(r.ok, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, "Nigeria Startup Grant 2027 ($3,000)");
  assert.equal(saved[0].amount, "$3,000");
  assert.equal(saved[0].deadline, "2027-01-10");
  assert.equal(saved[0].user_id, "user-1");
});
