import { test } from "node:test";
import assert from "node:assert/strict";
import { careerLinks, findHiringEmail, hiringNote, pickHiringEmail } from "./hiring.ts";
import { domainFromApplyUrl } from "../jobs/company.ts";

test("a careers inbox beats a general one, and other companies' addresses are skipped", () => {
  const pages = [
    {
      url: "https://acme.com/",
      html: `<a href="mailto:hello@acme.com">hello@acme.com</a> Built by studio@agency.io`,
    },
    {
      url: "https://acme.com/careers",
      html: `Send your CV to <a href="mailto:careers@acme.com">careers@acme.com</a>. Privacy: privacy@acme.com`,
    },
  ];
  assert.deepEqual(pickHiringEmail(pages, "acme.com"), {
    email: "careers@acme.com",
    kind: "hiring",
    foundOn: "https://acme.com/careers",
  });
});

test("a general inbox is used when there is no hiring one, and support or sales never", () => {
  const pages = [
    {
      url: "https://acme.com/contact",
      html: "support@acme.com sales@acme.com noreply@acme.com info@acme.com",
    },
  ];
  assert.equal(pickHiringEmail(pages, "acme.com")?.email, "info@acme.com");
  assert.equal(pickHiringEmail(pages, "acme.com")?.kind, "general");
  assert.equal(
    pickHiringEmail(
      [
        {
          url: "https://acme.com/",
          html: "support@acme.com jane.doe@acme.com logo@2x.png",
        },
      ],
      "acme.com",
    ),
    null,
  );
});

test("hidden addresses like jobs [at] acme.com are read, and subdomains count", () => {
  assert.equal(pickHiringEmail([{ url: "https://acme.com/jobs", html: "Email jobs [at] acme.com" }], "acme.com")?.email, "jobs@acme.com");
  assert.equal(pickHiringEmail([{ url: "https://acme.com/", html: "hr@uk.acme.com" }], "acme.com")?.email, "hr@uk.acme.com");
});

test("careers links on the home page are followed, only on the same site", () => {
  const html = `<a href="/about">About</a><a href="/en/join-us">Join us</a><a href="https://other.com/careers">x</a><a href="/blog">Blog</a><a href="/company"><span>Careers</span></a>`;
  assert.deepEqual(careerLinks(html, "https://acme.com/"), ["https://acme.com/en/join-us", "https://acme.com/company"]);
});

test("job boards and form sites are never taken as the company's website", () => {
  for (const u of [
    "https://www.hotnigerianjobs.com/hotjobs/1",
    "https://acme.wd5.myworkdayjobs.com/x",
    "https://docs.google.com/forms/d/x",
    "https://forms.gle/abc",
    "https://ng.indeed.com/viewjob?jk=1",
    "https://jobs.smartrecruiters.com/Acme/1",
  ])
    assert.equal(domainFromApplyUrl(u), null, u);
  assert.equal(domainFromApplyUrl("https://careers.acme.com/apply"), "careers.acme.com");
});

test("the finder reads their site and checks the domain takes email", async () => {
  const site: Record<string, string> = {
    "https://acme.com/": `<a href="/work-here">Work here</a> hello@acme.com`,
    "https://acme.com/work-here": "Apply: talent@acme.com",
  };
  const fetcher = (async (url: string) => {
    const body = site[String(url)];
    return body ? new Response(body, { headers: { "content-type": "text/html" } }) : new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  // Response.url is empty for a Response built by hand, so the asked address is used.
  const found = await findHiringEmail("Acme", "https://boards.greenhouse.io/acme/jobs/1", "acme.com", { fetcher, hasMail: async () => true });
  assert.equal(found.found?.email, "talent@acme.com");
  assert.ok(found.checked.includes("https://acme.com/work-here"));
  const bounces = await findHiringEmail("Acme", "", "acme.com", {
    fetcher,
    hasMail: async () => false,
  });
  assert.equal(bounces.found, null);
});

test("the note says where the address came from", () => {
  assert.match(
    hiringNote({
      email: "jobs@acme.com",
      kind: "hiring",
      foundOn: "https://www.acme.com/careers",
    }),
    /^Found on their website \(acme\.com\/careers\)\. It is their hiring inbox\.$/,
  );
  assert.match(
    hiringNote({
      email: "info@acme.com",
      kind: "general",
      foundOn: "https://acme.com/",
    }),
    /pass it to the hiring team/,
  );
});
