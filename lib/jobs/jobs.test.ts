import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import F from "../apply/facts.js";
import E from "../apply/engine.js";
import { blankFacts, hydrateFacts, storeFacts, type Facts } from "./facts.ts";
import { dedupe, eligibility, scoreJob } from "./fit.ts";
import { cleanPreferences, DEFAULT_PREFERENCES } from "./preferences.ts";
import { type JobPost, SOURCE_IDS, SOURCES } from "./sources.ts";
import { htmlToText, monthlyUsd, parsePay, payLabel } from "./text.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const FIXTURE_URL: Record<string, [string, string]> = {
  remotive: ["remotive.json", "https://remotive.com/api/remote-jobs?category=software-dev&limit=100"],
  remoteok: ["remoteok.json", "https://remoteok.com/api"],
  himalayas: ["himalayas.json", "https://himalayas.app/jobs/api/search?q=accessibility&limit=20"],
  jobicy: ["jobicy.json", "https://jobicy.com/api/v2/remote-jobs?count=50&tag=react"],
  weworkremotely: ["wwr.xml", "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss"],
  arbeitnow: ["arbeitnow.json", "https://www.arbeitnow.com/api/job-board-api"],
  greenhouse: ["greenhouse.json", "https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true"],
  ashby: ["ashby.json", "https://api.ashbyhq.com/posting-api/job-board/linear?includeCompensation=true"],
  lever: ["lever.json", "https://api.lever.co/v0/postings/spotify?mode=json"],
  hotnigerianjobs: ["hnj.xml", "https://www.hotnigerianjobs.com/feed/"],
  a11yjobs: ["a11yjobs.xml", "https://www.a11yjobs.com/sitemap.xml"],
  workingnomads: ["workingnomads.json", "https://www.workingnomads.com/api/exposed_jobs/"],
};
const facts = F as unknown as Facts;
const now = new Date("2026-10-21T12:00:00Z");

function post(over: Partial<JobPost>): JobPost {
  return {
    source: "remotive",
    externalId: "1",
    title: "Frontend Developer",
    company: "Kola Pay",
    companyLogo: null,
    url: "https://example.com/job",
    applyUrl: "https://example.com/job",
    description: "We build a merchant dashboard in React, Next.js and TypeScript. You care about WCAG, screen readers and Core Web Vitals. ".repeat(5),
    location: "Worldwide",
    restrictions: ["Worldwide"],
    pay: { min: 60_000, max: 80_000, currency: "USD", period: "year" },
    employmentType: "Full time",
    postedAt: "2026-10-20T09:00:00Z",
    tags: ["react"],
    ...over,
  };
}

for (const id of SOURCE_IDS) {
  test(`${SOURCES[id].name} turns its real response into complete job posts`, () => {
    const [file, url] = FIXTURE_URL[id];
    const jobs = SOURCES[id].parse(fixture(file), url);
    assert.ok(jobs.length > 0, "no jobs parsed");
    for (const j of jobs) {
      assert.equal(j.source, id);
      assert.ok(j.externalId && j.externalId !== "undefined", "missing id");
      assert.ok(j.title.length > 2, "missing title");
      assert.match(j.url, /^https:\/\//);
      assert.match(j.applyUrl, /^https:\/\//);
      assert.ok(!/<[a-z][^>]*>|&lt;|&amp;/i.test(j.description), "description still has HTML");
      assert.ok(j.postedAt === null || !Number.isNaN(Date.parse(j.postedAt)));
    }
  });
}

test("Remote OK skips its legal notice row", () => {
  const jobs = SOURCES.remoteok.parse(fixture("remoteok.json"), "https://remoteok.com/api");
  assert.equal(jobs.length, 3);
});

test("board names become the company name for Ashby and Lever", () => {
  assert.equal(SOURCES.ashby.parse(fixture("ashby.json"), FIXTURE_URL.ashby[1])[0].company, "Linear");
  assert.equal(SOURCES.lever.parse(fixture("lever.json"), FIXTURE_URL.lever[1])[0].company, "Spotify");
});

test("We Work Remotely splits Company: Title", () => {
  const [first] = SOURCES.weworkremotely.parse(fixture("wwr.xml"), FIXTURE_URL.weworkremotely[1]);
  assert.equal(first.company, "Current");
  assert.equal(first.title, "Freelance Marketo Email Engineer");
  assert.deepEqual(first.restrictions, []);
});

test("salary text from real posts is read into a monthly figure", () => {
  assert.deepEqual(parsePay("$170k - $200k"), { min: 170_000, max: 200_000, currency: "USD", period: "year" });
  assert.deepEqual(parsePay("$35,3k- $52k"), { min: 35_300, max: 52_000, currency: "USD", period: "year" });
  assert.deepEqual(parsePay("$50-$75 /hour"), { min: 50, max: 75, currency: "USD", period: "hour" });
  assert.equal(parsePay("$1000 per task"), null);
  assert.equal(parsePay(""), null);
  assert.equal(parsePay("€4.500 per month")?.currency, "EUR");
  assert.equal(monthlyUsd(parsePay("$50-$75 /hour")), 8000);
  assert.equal(monthlyUsd(parsePay("$24,000 a year")), 2000);
  assert.equal(payLabel(parsePay("$170k - $200k")), "$170k - $200k a year");
});

test("double-escaped HTML from Greenhouse becomes plain text", () => {
  assert.equal(htmlToText("&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;&lt;ul&gt;&lt;li&gt;React&lt;/li&gt;&lt;/ul&gt;"), "Build & ship\n\n- React");
});

test("where you can work: worldwide, Africa, Abuja and visa pass; US-only fails", () => {
  const prefs = DEFAULT_PREFERENCES;
  assert.equal(eligibility(post({}), prefs).eligibility, "worldwide");
  assert.equal(eligibility(post({ restrictions: ["EMEA"], location: "EMEA" }), prefs).eligibility, "region");
  assert.equal(eligibility(post({ restrictions: ["Abuja, Nigeria"], location: "Abuja" }), prefs).eligibility, "local");
  assert.equal(eligibility(post({ restrictions: ["United States"], location: "United States" }), prefs).eligibility, "restricted");
  assert.equal(eligibility(post({ restrictions: ["Hybrid - London"], location: "Hybrid - London" }), prefs).eligibility, "restricted");
  const visa = post({ restrictions: ["Germany"], location: "Berlin", description: "We offer visa sponsorship and relocation support." });
  assert.equal(eligibility(visa, prefs).eligibility, "visa");
  const noVisa = post({ restrictions: ["Germany"], location: "Berlin", description: "We do not offer visa sponsorship." });
  assert.equal(eligibility(noVisa, prefs).eligibility, "restricted");
  assert.equal(eligibility(post({ restrictions: ["South Africa"], location: "South Africa" }), prefs).eligibility, "restricted");
  assert.equal(eligibility(post({ restrictions: ["United Kingdom - Remote"], location: "United Kingdom - Remote" }), prefs).eligibility, "restricted");
  assert.equal(eligibility(post({ restrictions: ["Remote"], location: "Remote" }), prefs).eligibility, "worldwide");
  const locked = post({ description: "Remote, but you must be based in the US to apply." });
  assert.equal(eligibility(locked, prefs).eligibility, "restricted");
});

test("a fresh worldwide React post that pays well is a strong fit with reasons", () => {
  const fit = scoreJob(post({}), facts, DEFAULT_PREFERENCES, now);
  assert.equal(fit.hidden, null);
  assert.equal(fit.band, "strong");
  assert.ok(fit.matched.includes("React"));
  assert.ok(fit.reasons.some((r) => r.startsWith("Matches")));
  assert.ok(fit.reasons.includes("Open worldwide"));
});

test("posts under the pay floor, outside your fields or US-only are hidden with the reason", () => {
  const cheap = scoreJob(post({ pay: { min: 800, max: 1200, currency: "USD", period: "month" } }), facts, DEFAULT_PREFERENCES, now);
  assert.match(cheap.hidden ?? "", /under your \$2,000 floor/);
  const offField = scoreJob(post({ title: "Amazon Supply Chain Manager", description: "Run inventory and logistics. ".repeat(30), tags: [] }), facts, DEFAULT_PREFERENCES, now);
  assert.equal(offField.hidden, "Outside your fields");
  const lookalike = scoreJob(post({ title: "Remote Office Assistant", description: "Answer email and book meetings. ".repeat(30), tags: [] }), facts, DEFAULT_PREFERENCES, now);
  assert.equal(lookalike.hidden, "Outside your fields");
  const usOnly = scoreJob(post({ restrictions: ["United States"], location: "United States" }), facts, DEFAULT_PREFERENCES, now);
  assert.match(usOnly.hidden ?? "", /Open only to United States/);
});

test("old, nameless and short posts are flagged as possible ghost jobs", () => {
  const fit = scoreJob(post({ company: "", postedAt: "2021-04-27T20:13:45Z", description: "React developer wanted." }), facts, DEFAULT_PREFERENCES, now);
  assert.ok(fit.flags.some((f) => f.includes("over 6 months")));
  assert.ok(fit.flags.includes("No company is named."));
  assert.ok(fit.flags.includes("Very short post with few details."));
  assert.ok(fit.score < scoreJob(post({}), facts, DEFAULT_PREFERENCES, now).score);
});

test("the same job on two boards is kept once, preferring the company's own board", () => {
  const kept = dedupe([post({ source: "remotive" }), post({ source: "greenhouse", externalId: "9", company: "Kola Pay Inc." })]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].source, "greenhouse");
});

test("preferences are cleaned: bad numbers, unknown sources and unsafe board names dropped", () => {
  const p = cleanPreferences({ minMonthlyUsd: "abc", sources: ["remotive", "evil"], boards: { greenhouse: ["vercel", "../etc"] }, searches: "react, react, ux" });
  assert.equal(p.minMonthlyUsd, 2000);
  // Boards added later (Hot Nigerian Jobs) join a saved list unless you turned them off.
  assert.deepEqual(p.sources, ["remotive", "hotnigerianjobs", "a11yjobs", "workingnomads"]);
  assert.deepEqual(p.boards.greenhouse, ["vercel"]);
  assert.deepEqual(p.searches, ["react", "ux"]);
  assert.deepEqual(cleanPreferences(undefined), DEFAULT_PREFERENCES);
});

test("the fact bank survives a round trip through the database format", () => {
  const back = hydrateFacts(JSON.parse(JSON.stringify(storeFacts(facts))));
  assert.ok(back.tracks.frontend.titleOk.test("Frontend Developer"));
  assert.deepEqual(back.skills, facts.skills);
});

test("a new user starts with a blank fact bank that keeps the role types", () => {
  const blank = blankFacts(facts);
  assert.equal(blank.person.name, "");
  assert.equal(blank.jobs.length, 0);
  assert.ok(blank.skills.every((g) => g.items.length === 0));
  assert.deepEqual(Object.keys(blank.tracks), Object.keys(facts.tracks));
  assert.equal(scoreJob(post({}), blank, DEFAULT_PREFERENCES, now).matched.length, 0);
});

test("a source is skipped until its wait is over, so Remotive is asked at most 4 times a day", async () => {
  const { dueSources } = await import("./run.ts");
  const state = { remotive: "2026-10-21T08:00:00Z", remoteok: "2026-10-21T08:00:00Z" };
  const due = dueSources(DEFAULT_PREFERENCES, state, new Date("2026-10-21T12:00:00Z"));
  assert.ok(!due.includes("remotive"), "remotive waits 6 hours");
  assert.ok(due.includes("remoteok"), "remote ok waits 3 hours");
  assert.ok(due.includes("jobicy"), "never fetched means due");
});

test("rows keep hidden jobs with the reason but drop jobs outside your fields", async () => {
  const { toRows } = await import("./run.ts");
  const rows = toRows(
    [post({}), post({ externalId: "2", title: "Warehouse Lead", company: "B" }), post({ externalId: "3", company: "C", restrictions: ["United States"], location: "United States" })],
    facts,
    DEFAULT_PREFERENCES,
    "u1",
    now,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].hidden_reason, null);
  assert.match(rows[1].hidden_reason ?? "", /United States/);
  assert.equal(rows[0].user_id, "u1");
});

test("one failing board never stops the others", async () => {
  const { fetchSources } = await import("./run.ts");
  const fake = (async (url: string) => (url.includes("remoteok") ? new Response("down", { status: 503 }) : new Response(fixture("remotive.json")))) as unknown as typeof fetch;
  const out = await fetchSources(["remotive", "remoteok"], DEFAULT_PREFERENCES, fake);
  assert.deepEqual(out.fetched, ["remotive"]);
  assert.equal(out.errors.length, 1);
  assert.equal(out.errors[0].error, "HTTP 503");
  assert.ok(out.posts.length > 0);
});

test("company pages give a summary, and unsafe or job-board hosts are never fetched", async () => {
  const { readCompanyPage, safeDomain, domainFromApplyUrl, lookUpCompany } = await import("./company.ts");
  const page = readCompanyPage(
    '<html><head><title>Kola Pay &amp; Co</title><meta content="Payments for African merchants." name="description"><meta property="og:image" content="https://kola.test/og.png"></head></html>',
  );
  assert.deepEqual(page, { title: "Kola Pay & Co", description: "Payments for African merchants.", image: "https://kola.test/og.png" });
  assert.equal(safeDomain("localhost"), null);
  assert.equal(safeDomain("127.0.0.1"), null);
  assert.equal(safeDomain("db.internal"), null);
  assert.equal(safeDomain("www.Vercel.com"), "vercel.com");
  assert.equal(domainFromApplyUrl("https://job-boards.greenhouse.io/vercel/jobs/1"), null);
  assert.equal(domainFromApplyUrl("https://careers.kola.test/apply"), "careers.kola.test");

  const asked: string[] = [];
  const fake = (async (url: string) => {
    asked.push(url);
    if (url.includes("clearbit")) return new Response(JSON.stringify([{ name: "Vercel", domain: "vercel.com" }]));
    return new Response('<meta name="description" content="The AI cloud.">');
  }) as unknown as typeof fetch;
  const info = await lookUpCompany("Vercel", "https://job-boards.greenhouse.io/vercel/jobs/1", fake, now);
  assert.equal(info.website, "https://vercel.com");
  assert.equal(info.summary, "The AI cloud.");
  assert.equal(info.links[0].href, "https://vercel.com");
  assert.ok(info.links.some((l) => l.label === "LinkedIn"));
  assert.deepEqual(asked, ["https://autocomplete.clearbit.com/v1/companies/suggest?query=Vercel", "https://vercel.com"]);
});

test("profile saves are cleaned: unknown keys dropped, regex characters stripped, lists capped", async () => {
  const { cleanFacts } = await import("./facts.ts");
  const base = storeFacts(facts);
  const out = cleanFacts(
    {
      person: { name: "  Bryan  ", evil: "x" },
      tracks: { frontend: { titleOk: "react|(.*)+|front" } },
      gaps: ["Vue", "", "PHP"],
      skills: [{ group: "Front-end", items: [{ label: "Astro" }] }],
      jobs: [{ org: "Acme", bullets: [{ text: "Shipped it", tags: ["Ship"] }, { text: "" }] }],
    },
    base,
  );
  assert.equal(out.person.name, "Bryan");
  assert.equal("evil" in out.person, false);
  assert.equal(out.tracks.frontend.titleOk, "react|front");
  assert.deepEqual(out.gaps, ["vue", "php"]);
  assert.deepEqual(out.skills[0].items[0], { label: "Astro", aliases: ["astro"] });
  assert.deepEqual(out.jobs[0].bullets, [{ text: "Shipped it", tags: ["ship"] }]);
  assert.equal(out.tracks.design.profile, base.tracks.design.profile);
  assert.deepEqual(cleanFacts(base, base), base);
});

test("a dropped connection is retried once before the board counts as failed", async () => {
  const { fetchSources } = await import("./run.ts");
  let calls = 0;
  const flaky = (async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    return new Response(fixture("remoteok.json"));
  }) as unknown as typeof fetch;
  const out = await fetchSources(["remoteok"], DEFAULT_PREFERENCES, flaky);
  assert.equal(calls, 2);
  assert.deepEqual(out.errors, []);
  assert.equal(out.posts.length, 3);
});

test("contract terms like Temp to Perm stay out of the CV headline", () => {
  const a = E.analyze("Senior Product Designer (Webflow) Temp to Perm\nFigma, prototypes, usability testing", facts);
  const cv = E.makeCV(a, { jd: "Figma", role: "Senior Product Designer (Webflow) Temp to Perm" }, facts);
  assert.match(cv, /\n\nProduct Designer \(CPACC\)\n/);
});

test("sites you skip are never searched and their jobs are hidden", async () => {
  const { blocked, cleanPreferences, siteOf } = await import("./preferences.ts");
  const { dueSources } = await import("./run.ts");
  const prefs = cleanPreferences({});
  assert.deepEqual(prefs.blockedSites, ["himalayas.app"]);
  assert.ok(!dueSources(prefs, {}).includes("himalayas"));
  assert.equal(blocked("https://jobs.himalayas.app/x", prefs.blockedSites), "himalayas.app");
  assert.equal(blocked("https://remotive.com/x", prefs.blockedSites), null);
  assert.equal(siteOf("https://www.Example.com/jobs?x=1"), "example.com");
  assert.deepEqual(cleanPreferences({ blockedSites: ["https://www.foo.io/a", "not a site"] }).blockedSites, ["foo.io"]);
  assert.ok(dueSources(cleanPreferences({ blockedSites: [] }), {}).includes("himalayas"), "you can take it off the list");
});

test("apply links that need an account first are named, others are not", async () => {
  const { needsAccount } = await import("./account.ts");
  assert.equal(needsAccount("https://acme.wd5.myworkdayjobs.com/en-US/careers/job/123"), "Workday");
  assert.equal(needsAccount("https://acme.taleo.net/careersection/2/jobdetail.ftl"), "Taleo");
  assert.equal(needsAccount("https://boards.greenhouse.io/acme/jobs/1"), null);
  assert.equal(needsAccount("https://careers.gofasti.com/job-application/6233771004?gh_jid=6233771004"), null);
  assert.equal(needsAccount("mailto:jobs@acme.com"), null);
  assert.equal(needsAccount("not a url"), null);
});

test("big companies join your own list once, and can be turned off", async () => {
  const { boardsFor, cleanPreferences } = await import("./preferences.ts");
  const on = boardsFor(cleanPreferences({ boards: { greenhouse: ["vercel", "stripe"], ashby: [], lever: [] } }));
  assert.ok(on.greenhouse.includes("openai") === false && on.ashby.includes("openai"));
  assert.equal(on.greenhouse.filter((b) => b === "stripe").length, 1);
  assert.deepEqual(boardsFor(cleanPreferences({ bigCompanies: false, boards: { greenhouse: ["vercel"], ashby: [], lever: [] } })).greenhouse, ["vercel", "moniepoint"]);
});

test("time zone rules: CET plus or minus 3 hours fits Lagos, US Pacific does not", async () => {
  const { zoneFits } = await import("./fit.ts");
  assert.equal(zoneFits("CET (+/- 3 hours)"), true);
  assert.equal(zoneFits("UTC+2"), true);
  assert.equal(zoneFits("PST"), false);
  assert.equal(zoneFits("EST +/- 2 hours"), false);
  assert.equal(zoneFits("United Kingdom"), null);
  assert.equal(zoneFits("West Coast"), null);
});

test("'U.S. Based' in the title is not worldwide, even when the board says anywhere", () => {
  const p = post({ title: "Web Developer (U.S. Based, Remote Contractor)", restrictions: [], location: "Anywhere in the World" });
  assert.equal(eligibility(p, DEFAULT_PREFERENCES).eligibility, "restricted");
});

test("'Home based Worldwide' is worldwide and 'Home based EMEA' is your region", () => {
  const gh = (where: string) => post({ source: "greenhouse", restrictions: [where], location: where });
  assert.equal(eligibility(gh("Home based Worldwide"), DEFAULT_PREFERENCES).eligibility, "worldwide");
  assert.equal(eligibility(gh("Home based - EMEA"), DEFAULT_PREFERENCES).eligibility, "region");
  assert.equal(eligibility(gh("Home based Americas"), DEFAULT_PREFERENCES).eligibility, "restricted");
});

test("everyday words like 'research', 'performance', 'payments' and 'API' are not counted as your skills", () => {
  const p = post({ title: "Software Engineer", tags: [], description: "Our research team tracks performance of the payments API and the OpenAI API platform. ".repeat(6) });
  const fit = scoreJob(p, facts, DEFAULT_PREFERENCES, now);
  for (const s of ["user research", "Core Web Vitals", "Paystack", "REST APIs"]) assert.ok(!fit.matched.includes(s), s);
  const real = scoreJob(post({ tags: [], description: "You will run user research and improve Core Web Vitals. ".repeat(6) }), facts, DEFAULT_PREFERENCES, now);
  assert.ok(real.matched.includes("user research") && real.matched.includes("Core Web Vitals"));
});

test("a job in your main field ranks above a wider software job with the same post", () => {
  const a11y = scoreJob(post({ title: "Accessibility Engineer" }), facts, DEFAULT_PREFERENCES, now);
  const front = scoreJob(post({ title: "Frontend Developer" }), facts, DEFAULT_PREFERENCES, now);
  const wide = scoreJob(post({ title: "Data Engineer" }), facts, DEFAULT_PREFERENCES, now);
  assert.ok(a11y.score > front.score && front.score > wide.score, `${a11y.score} ${front.score} ${wide.score}`);
});

test("an office job that sponsors a visa ranks below the same job open remotely, and says you would move", () => {
  const desc = "We offer visa sponsorship and relocation support. React, Next.js and TypeScript. ".repeat(6);
  const office = scoreJob(post({ source: "ashby", restrictions: ["San Francisco"], location: "San Francisco", description: desc }), facts, DEFAULT_PREFERENCES, now);
  const remote = scoreJob(post({ description: desc }), facts, DEFAULT_PREFERENCES, now);
  assert.equal(office.eligibility, "visa");
  assert.ok(office.score < remote.score - 10, `${office.score} ${remote.score}`);
  assert.ok(office.flags.some((f) => /move to San Francisco/.test(f)));
});

test("the same OpenAI role in three cities is one job", () => {
  const city = (c: string) => post({ source: "ashby", externalId: c, company: "OpenAI", title: `Forward Deployed Software Engineer - ${c}`, location: c, restrictions: [c] });
  assert.equal(dedupe([city("SF"), city("NYC"), city("Seattle")]).length, 1);
});

test("a front desk job is not a front-end job", () => {
  const fit = scoreJob(post({ title: "Front Desk Officer (Female)", source: "hotnigerianjobs", location: "Abuja", restrictions: ["Abuja"] }), facts, DEFAULT_PREFERENCES, now);
  assert.equal(fit.hidden, "Outside your fields");
});

test("reads the closing date a post gives, in the ways Nigerian posts write it", async () => {
  const { closingDate } = await import("./text.ts");
  assert.equal(closingDate("Application Closing Date\n5th November, 2026."), "2026-11-05");
  assert.equal(closingDate("Deadline: 30 November 2026"), "2026-11-30");
  assert.equal(closingDate("Closing date: 12/11/2026"), "2026-11-12");
  assert.equal(closingDate("Applications close on 1 December 2026 at noon"), "2026-12-01");
  assert.equal(closingDate("Not Specified"), null);
  assert.equal(closingDate("We closed a $5m round on 3 March 2025."), null);
});

test("a post that has closed, or whose closing date has passed, is hidden with the reason", () => {
  const closed = scoreJob(post({ title: "IT Support Officer", description: "Support our staff. ".repeat(40) + "Application Closing Date 5th November, 2026. Sorry, this listing is no longer open." }), facts, DEFAULT_PREFERENCES, new Date("2026-11-06T09:00:00Z"));
  assert.equal(closed.hidden, "This job has closed");
  const passed = scoreJob(post({ description: "React work. ".repeat(40) + "Deadline: 30 October 2026" }), facts, DEFAULT_PREFERENCES, new Date("2026-11-06T09:00:00Z"));
  assert.equal(passed.hidden, "Closed on 30 October 2026");
  const open = scoreJob(post({ description: "React work. ".repeat(40) + "Deadline: 30 November 2026" }), facts, DEFAULT_PREFERENCES, new Date("2026-11-06T09:00:00Z"));
  assert.equal(open.hidden, null);
  assert.ok(open.reasons.some((r) => r === "Apply by 30 November 2026"));
});

test("an email hidden by the job site is named, with what to do", () => {
  const fit = scoreJob(post({ source: "hotnigerianjobs", description: "React work. ".repeat(40) + "How to Apply: send your CV to: [email protected] using the Job Title as the subject." }), facts, DEFAULT_PREFERENCES, now);
  assert.ok(fit.flags.some((f) => f.startsWith("The site hides the email to apply to.")), fit.flags.join(" | "));
});

test("with job titles set, only those jobs are in your field: a virtual assistant never sees engineering", async () => {
  const { inYourFields } = await import("./fit.ts");
  const va = { ...DEFAULT_PREFERENCES, titles: ["Virtual Assistant", "Customer Support"] };
  assert.equal(inYourFields("Executive Virtual Assistant (Remote)", facts, va), true);
  assert.equal(inYourFields("VA for a busy founder", facts, va), true);
  assert.equal(inYourFields("Executive Assistant to the CEO", facts, va), true);
  assert.equal(inYourFields("Customer Service Representative", facts, va), true);
  assert.equal(inYourFields("Senior Software Engineer", facts, va), false);
  assert.equal(inYourFields("Frontend Developer", facts, va), false);
  assert.equal(inYourFields("Customer Success Engineer, Sydney", facts, va), false);
  assert.equal(inYourFields("IT Support Specialist", facts, va), false);
  assert.equal(inYourFields("Support Engineer", facts, { ...va, titles: ["Support Engineer"] }), true);
  const fit = scoreJob(post({ title: "Frontend Developer" }), facts, va, now);
  assert.equal(fit.hidden, "Outside your fields");
  // With no titles set, the role types decide, as before.
  assert.equal(inYourFields("Frontend Developer", facts, DEFAULT_PREFERENCES), true);
});

test("job titles become the search words, and long lists take turns day by day", async () => {
  const { searchWords } = await import("./preferences.ts");
  const va = { ...DEFAULT_PREFERENCES, titles: ["Virtual Assistant", "Customer Support"] };
  assert.deepEqual(searchWords(va), ["Virtual Assistant", "Customer Support"]);
  const many = { ...DEFAULT_PREFERENCES, titles: Array.from({ length: 20 }, (_, i) => `Role ${i}`) };
  const a = searchWords(many, new Date("2026-11-06T00:00:00Z"));
  const b = searchWords(many, new Date("2026-11-07T00:00:00Z"));
  assert.equal(a.length, 16);
  assert.notDeepEqual(a, b);
  assert.equal(new Set([...a, ...b]).size, 20);
  assert.deepEqual(cleanPreferences({ titles: [" Virtual Assistant ", "", "virtual assistant"] }).titles, ["Virtual Assistant"]);
});
