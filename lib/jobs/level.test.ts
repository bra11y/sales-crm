import { test } from "node:test";
import assert from "node:assert/strict";
import { jobLevel, yearsAsked } from "./level.ts";
import { parseHnjFeed, readHnjPage } from "./nigeria.ts";
import { needsAccount } from "./account.ts";
import { cleanPreferences } from "./preferences.ts";

test("job level comes from the title first, then the years asked", () => {
  assert.equal(jobLevel("Senior Front End Engineer").level, "senior");
  assert.equal(jobLevel("Design Lead").level, "senior");
  assert.equal(jobLevel("Junior UX Designer").level, "entry");
  assert.equal(jobLevel("Digital Engagement Intern").level, "entry");
  assert.equal(jobLevel("Front End Engineer", "You have 7+ years of experience with React.").level, "senior");
  assert.equal(jobLevel("Front End Engineer", "1-2 years of experience is fine.").level, "entry");
  assert.equal(jobLevel("Product Designer", "We use Figma.").level, "mid");
  assert.equal(yearsAsked("3 to 5 years of relevant experience and 2 years of React"), 3);
  assert.equal(yearsAsked("2+ years experience or 4 years of work experience"), 2);
});

test("saved board lists still get boards added later, unless turned off", () => {
  const old = ["remotive", "greenhouse"];
  assert.ok(cleanPreferences({ sources: old }).sources.includes("hotnigerianjobs"));
  assert.ok(!cleanPreferences({ sources: old, sourcesOff: ["hotnigerianjobs"] }).sources.includes("hotnigerianjobs"));
  assert.deepEqual(cleanPreferences({}).levels, ["entry", "mid"]);
  assert.deepEqual(cleanPreferences({ levels: [] }).levels, ["entry", "mid"]);
});

test("Jobicy and We Work Remotely count as sign-up sites", () => {
  assert.equal(needsAccount("https://jobicy.com/jobs/1-x"), "Jobicy");
  assert.equal(needsAccount("https://weworkremotely.com/remote-jobs/x"), "We Work Remotely");
  assert.equal(needsAccount("https://jobs.ashbyhq.com/x"), null);
});

const FEED = `<rss><channel>
<item><title>Digital Engagement Intern at ActionAid Nigeria (AAN)</title><link>https://www.hotnigerianjobs.com/hotjobs/980402/x.html</link><description>For young graduates.</description><pubDate>Fri, 23 Oct 2026 18:15:14 +0100</pubDate></item>
<item><title>SUMTV Job Recruitment (4 Positions)</title><link>https://www.hotnigerianjobs.com/hotjobs/980418/y.html</link><description>Four roles.</description><pubDate>Fri, 23 Oct 2026 18:15:14 +0100</pubDate></item>
</channel></rss>`;
const PAGE = `<h1><a href="x">Digital Engagement Intern at ActionAid Nigeria (AAN)</a></h1><div><p>Job Title: Digital Engagement Intern<br/>Location:<br/>Abuja (FCT)<br/>Job type: Contract</p><p>Send your CV.</p><p><strong>Method of Application</strong><br/><a href="https://nigeria.actionaid.org/jobs/2026/intern?utm_source=HNJ&amp;id=4">Click here to apply online</a></p></div>Share this job`;

test("Hot Nigerian Jobs: single roles kept, round-ups skipped, the employer link read from the page", () => {
  const posts = parseHnjFeed(FEED);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, "Digital Engagement Intern");
  assert.equal(posts[0].company, "ActionAid Nigeria (AAN)");
  const full = readHnjPage(PAGE, posts[0]);
  assert.equal(full.applyUrl, "https://nigeria.actionaid.org/jobs/2026/intern?id=4");
  assert.equal(full.location, "Abuja (FCT) (on-site)");
  assert.match(full.description, /Send your CV/);
});
