import { test } from "node:test";
import assert from "node:assert/strict";
import { parseA11ySitemap, parseWorkingNomads, readA11yPage } from "./more-boards.ts";


test("a11yjobs: only job pages from the last 30 days, newest first; category pages skipped", () => {
  const xml = `<urlset>
<url><loc>https://www.a11yjobs.com/jobs/accessibility-engineer</loc><lastmod>2026-11-01T10:00:00+00:00</lastmod></url>
<url><loc>https://www.a11yjobs.com/jobs/accessibility-engineer-design-systems-alfa-VOA10</loc><lastmod>2026-10-31T10:00:00+00:00</lastmod></url>
<url><loc>https://www.a11yjobs.com/jobs/assistive-technology-specialist-pJScI6wasR</lastmod></url>
<url><loc>https://www.a11yjobs.com/jobs/web-accessibility-lead-acme-AB12C</loc><lastmod>2026-11-01T20:00:00+00:00</lastmod></url>
<url><loc>https://www.a11yjobs.com/jobs/old-role-acme-ZZ99Z</loc><lastmod>2026-08-01T20:00:00+00:00</lastmod></url>
</urlset>`;
  const jobs = parseA11ySitemap(xml);
  assert.deepEqual(
    jobs.map((j) => j.title),
    ["Web Accessibility Lead Acme", "Accessibility Engineer Design Systems Alfa"],
  );
  assert.equal(jobs[0].source, "a11yjobs");
});

test("a11yjobs: the job page's JobPosting data fills in company, place and pay", () => {
  const [stub] = parseA11ySitemap(`<url><loc>https://www.a11yjobs.com/jobs/accessibility-engineer-alfa-VOA10</loc><lastmod>2026-10-31T10:00:00+00:00</lastmod></url>`);
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    title: "Accessibility Engineer, Design Systems",
    description: "<p>Build Web Components that work with screen readers.</p>",
    datePosted: "2026-10-31",
    employmentType: "FULL_TIME",
    hiringOrganization: { "@type": "Organization", name: "Alfa" },
    jobLocationType: "TELECOMMUTE",
    baseSalary: { currency: "EUR", value: { minValue: 50000, maxValue: 70000, unitText: "YEAR" } },
  })}</script>`;
  const job = readA11yPage(html, stub);
  assert.equal(job.title, "Accessibility Engineer, Design Systems");
  assert.equal(job.company, "Alfa");
  assert.deepEqual(job.restrictions, ["Anywhere"]);
  assert.equal(job.location, "Anywhere (remote)");
  assert.deepEqual(job.pay, { min: 50000, max: 70000, currency: "EUR", period: "year" });
  assert.match(job.description, /screen readers/);
});

test("Working Nomads: keeps development jobs, splits places, keeps time zone rules whole", () => {
  const body = JSON.stringify([
    { url: "https://www.workingnomads.com/job/go/1/", title: "Full Stack Developer", company_name: "Acme", category_name: "Development", tags: "react,node", location: "Time zone: CET (+/- 3 hours)", pub_date: "2026-10-29T09:50:51-04:00", description: "<p>Build things.</p>" },
    { url: "https://www.workingnomads.com/job/go/2/", title: "Backend Engineer", company_name: "Beta", category_name: "Development", tags: "", location: "Europe, LATAM, the U.S., Canada", pub_date: "2026-10-29T09:50:51-04:00", description: "" },
    { url: "https://www.workingnomads.com/job/go/3/", title: "Sales Rep", company_name: "Gamma", category_name: "Sales", tags: "", location: "Global", pub_date: "2026-10-29T09:50:51-04:00", description: "" },
  ]);
  const jobs = parseWorkingNomads(body);
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs[0].restrictions, ["CET (+/- 3 hours)"]);
  assert.deepEqual(jobs[1].restrictions, ["Europe", "LATAM", "U.S", "Canada"]);
  assert.deepEqual(jobs[0].tags, ["react", "node"]);
});
