import { test } from "node:test";
import assert from "node:assert/strict";
import F from "./facts.js";
import E from "./engine.js";

const POSTS: Record<string, string> = {
  "accessibility contract":
    "Accessibility Consultant (Contract)\nNorthwind Outfitters is looking for a freelance accessibility specialist.\nScope of work:\n- Audit our Shopify store against WCAG 2.2 AA\n- Remediate the highest-priority issues in our Liquid theme\n- Test checkout with NVDA and VoiceOver\n- Provide a short training workshop for our design team\nPlease send a proposal with your fixed price. Budget is flexible.\nNice to have: Lottie animations.",
  "senior accessibility job":
    "Senior Accessibility Engineer\nAcme Health is hiring a senior engineer to lead WCAG compliance.\n- 5+ years with ARIA, screen readers and keyboard testing\n- Experience with Section 508 and the ADA\n- Build accessible React components with TypeScript\n- Experience with Cypress and Storybook",
  "frontend job":
    "Frontend Developer (Remote)\nJoin Kola Pay to build our merchant dashboard.\n- React, Next.js and TypeScript\n- Supabase or Postgres experience\n- Care about Core Web Vitals and performance\n- Experience with GraphQL and Redux is a plus",
  "ux job":
    "Product Designer\nJoin Bright Path Health and design our patient app.\n- Figma, design systems and prototypes\n- Run usability testing and user research\n- Work with engineers on handoff\n- After Effects for motion is a plus",
  "nigerian sme brief":
    "Website redesign for our laundry in Abuja\nWe need to redesign our website and build a new landing page. We also want to show up on Google Maps (SEO).\nBudget is in naira. Please send a quote and proposal.",
  "shopify agency":
    "Shopify Developer - Contract\nBrightline Agency is looking for a contractor for client stores.\n- Shopify Liquid theme development\n- Klaviyo integration\n- Page speed and Lighthouse improvements\nHourly rate, ongoing monthly work.",
};

const allBullets = new Set(F.jobs.flatMap((j: { bullets: { text: string }[] }) => j.bullets.map((b) => b.text)));
const LEVEL = /\b(senior|lead|principal|staff|head of|director)\b/i;

for (const [name, jd] of Object.entries(POSTS)) {
  test(`Apply output for "${name}" passes the quality gate`, () => {
    const a = E.analyze(jd, F);
    const o = { jd, company: a.guess.company || "Test Co", role: a.guess.role, manager: "Ada", why: "I use your product every week." };
    const docs: Record<string, string> = { cv: E.makeCV(a, o, F), cover: E.makeCover(a, o, F), proposal: E.makeProposal(a, o, F) };
    for (const [kind, md] of Object.entries(docs)) {
      // "Add a number" is advice about the Profile's facts, not a writing fault.
      assert.deepEqual(
        E.lint(md).filter((w: string) => !/have no number/.test(w)),
        [],
        `${kind} has slop warnings`,
      );
      assert.ok(!md.includes("\u2014"), `${kind} has an em dash`);
      const body = md.replace(/^<!--[\s\S]*?-->/, "");
      for (const gap of a.gaps as string[]) {
        assert.ok(!new RegExp(`\\b${gap.replace(/[.+#]/g, "\\$&")}\\b`, "i").test(body), `${kind} mentions "${gap}"`);
      }
    }
    assert.ok(!LEVEL.test(docs.cv.split("\n")[4]), "CV headline claims a level");
    const start = docs.cv.indexOf("## Professional Experience");
    const end = docs.cv.indexOf("## ", start + 5);
    for (const line of docs.cv
      .slice(start, end)
      .split("\n")
      .filter((l) => l.startsWith("- "))) {
      assert.ok(allBullets.has(line.slice(2)), `CV line not in facts.js: ${line.slice(0, 60)}`);
    }
    const figures: string[] = docs.cover.replace(/WCAG \d\.\d/g, "").match(/\b\d+\.\d+s?\b|\b\d+%/g) ?? [];
    assert.deepEqual(
      figures.filter((n, i) => figures.indexOf(n) !== i),
      [],
      "cover letter repeats a figure",
    );
    assert.ok(
      docs.cover
        .replace(/^<!--[\s\S]*?-->/, "")
        .split(/\s+/)
        .filter(Boolean).length <= 400,
      "cover letter over 400 words",
    );
  });
}

test("lint flags long letters and CVs with few measured results", () => {
  const long = "<!-- kind: letter -->\n\nHi Ada,\n\n" + "We ship work. ".repeat(140);
  assert.ok(E.lint(long).some((w: string) => /under 400/.test(w)));
  const cv = "<!-- kind: cv -->\n\n" + Array.from({ length: 8 }, (_, i) => `- Built thing ${"abcdefgh"[i]} for the team`).join("\n");
  assert.ok(E.lint(cv).some((w: string) => /8 of 8 bullets have no number/.test(w)));
});

test("every letter shape passes the slop check on every sample post", () => {
  for (const [name, jd] of Object.entries(POSTS)) {
    const a = E.analyze(jd, F);
    for (const shape of Object.keys(E.SHAPES)) {
      for (const seed of [0, 1, 2]) {
        const md = E.makeCover(a, { jd, company: a.guess.company || "Test Co", role: a.guess.role, manager: "", why: "I use your product every week.", shape, seed }, F);
        assert.deepEqual(E.lint(md), [], `${name} / ${shape} / ${seed}`);
        assert.match(md, new RegExp(`shape: ${shape}`));
      }
    }
  }
});

test("finds the recruiter's name in a post, and skips words that only look like names", () => {
  assert.equal(E.guessContact("Questions? Contact Ngozi Eze at jobs@x.com")?.first, "Ngozi");
  assert.equal(E.guessContact("Hiring manager: Dr. Tunde Bakare")?.greet, "Dr Bakare");
  assert.equal(E.guessContact("Meet the hiring team\n\nSarah Lee\nTalent Partner")?.first, "Sarah");
  assert.equal(E.guessContact("You will report to the Head of Design."), null);
  assert.equal(E.guessContact("Send your CV to our team today."), null);
});

test("an email read from a job page is kept only when it came from that job's page", async () => {
  const { acceptPageContact, emailsInApplySection } = await import("./page-contact.ts");
  const job = { url: "https://www.hotnigerianjobs.com/hotjobs/986534/x.html", apply_url: "https://www.hotnigerianjobs.com/hotjobs/986534/x.html" };
  const ok = acceptPageContact({ email: "Recruit@EduBridge.ng ", url: "https://hotnigerianjobs.com/hotjobs/986534/x.html", sentence: "send their CV to: recruit@edubridge.ng" }, job);
  assert.ok(ok.ok && ok.contact.email === "recruit@edubridge.ng" && ok.contact.sentence.startsWith("Read from the job page on hotnigerianjobs.com"));
  assert.equal(acceptPageContact({ email: "a@b.ng", url: "https://evil.example/x" }, job).ok, false);
  assert.equal(acceptPageContact({ email: "info@hotnigerianjobs.com", url: job.url }, job).ok, false);
  assert.equal(acceptPageContact({ email: "nope", url: job.url }, job).ok, false);

  const page = "Requirements\nA degree.\nHow to Apply\nInterested and qualified candidates should send their CV to: hr@meagroup.ng and/or fleet@meagroup.ng using \"Fleet Coordinator\" as the subject of the email.\nShare this job";
  const found = emailsInApplySection(page);
  assert.deepEqual(found.emails, ["hr@meagroup.ng", "fleet@meagroup.ng"]);
  assert.match(found.sentence, /send their CV to/);
  assert.deepEqual(emailsInApplySection("Contact us at info@company.com for anything.").emails, []);
});

test("another person's letter never says your city or your certificate", async () => {
  const { draftApplication } = await import("./compose.ts");
  const { blankFacts } = await import("../jobs/facts.ts");
  const other = blankFacts(F as never);
  other.person = { ...other.person, name: "Ada Obi", email: "ada@mail.com", location: "London, UK", portfolio: "https://ada.dev" };
  other.tracks.frontend.profile = "Front-end developer who builds React apps for small businesses. I cut a client's page load by 40%.";
  other.tracks.frontend.hook = "A 40% faster page load for a client.";
  other.skills = [{ group: "Front-end", items: [{ label: "React", aliases: ["react"] }] }];
  const job = { title: "Frontend Engineer", company: "Kuda", description: "Build our app in React for millions of users. ".repeat(4), track: "frontend" };
  for (const shape of ["classic", "short", "problem", "match"]) {
    const d = draftApplication(job, other, "Kuda helps people bank without fees, and I want to build for them.", "", { shape });
    assert.doesNotMatch(d.cover, /Abuja|Nigeria|CPACC|NVDA|Shopify Liquid/, shape);
    assert.match(d.cover, /London, UK/, shape);
  }
});

test("the company's own name is never a skill the post asks for", async () => {
  const { draftApplication } = await import("./compose.ts");
  const job = { title: "Frontend Engineer", company: "Paystack", description: "About Paystack: we help businesses in Africa get paid. Build accessible React and TypeScript components for the Paystack Dashboard. ".repeat(2), track: "frontend" };
  const d = draftApplication(job, F as never, "Paystack's checkout is how many sellers get paid.", "", { shape: "match" });
  assert.doesNotMatch(d.cover, /asks for[^.]*Paystack/);
  assert.ok(!d.matched.includes("Paystack"));
});
