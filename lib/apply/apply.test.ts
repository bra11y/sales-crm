import { test } from "node:test";
import assert from "node:assert/strict";
import F from "./facts.js";
import E from "./engine.js";

const POSTS: Record<string, string> = {
  "accessibility contract": "Accessibility Consultant (Contract)\nNorthwind Outfitters is looking for a freelance accessibility specialist.\nScope of work:\n- Audit our Shopify store against WCAG 2.2 AA\n- Remediate the highest-priority issues in our Liquid theme\n- Test checkout with NVDA and VoiceOver\n- Provide a short training workshop for our design team\nPlease send a proposal with your fixed price. Budget is flexible.\nNice to have: Lottie animations.",
  "senior accessibility job": "Senior Accessibility Engineer\nAcme Health is hiring a senior engineer to lead WCAG compliance.\n- 5+ years with ARIA, screen readers and keyboard testing\n- Experience with Section 508 and the ADA\n- Build accessible React components with TypeScript\n- Experience with Cypress and Storybook",
  "frontend job": "Frontend Developer (Remote)\nJoin Kola Pay to build our merchant dashboard.\n- React, Next.js and TypeScript\n- Supabase or Postgres experience\n- Care about Core Web Vitals and performance\n- Experience with GraphQL and Redux is a plus",
  "ux job": "Product Designer\nJoin Bright Path Health and design our patient app.\n- Figma, design systems and prototypes\n- Run usability testing and user research\n- Work with engineers on handoff\n- After Effects for motion is a plus",
  "nigerian sme brief": "Website redesign for our laundry in Abuja\nWe need to redesign our website and build a new landing page. We also want to show up on Google Maps (SEO).\nBudget is in naira. Please send a quote and proposal.",
  "shopify agency": "Shopify Developer - Contract\nBrightline Agency is looking for a contractor for client stores.\n- Shopify Liquid theme development\n- Klaviyo integration\n- Page speed and Lighthouse improvements\nHourly rate, ongoing monthly work.",
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
      assert.deepEqual(E.lint(md).filter((w: string) => !/have no number/.test(w)), [], `${kind} has slop warnings`);
      assert.ok(!md.includes("\u2014"), `${kind} has an em dash`);
      const body = md.replace(/^<!--[\s\S]*?-->/, "");
      for (const gap of a.gaps as string[]) {
        assert.ok(!new RegExp(`\\b${gap.replace(/[.+#]/g, "\\$&")}\\b`, "i").test(body), `${kind} mentions "${gap}"`);
      }
    }
    assert.ok(!LEVEL.test(docs.cv.split("\n")[4]), "CV headline claims a level");
    const start = docs.cv.indexOf("## Professional Experience");
    const end = docs.cv.indexOf("## ", start + 5);
    for (const line of docs.cv.slice(start, end).split("\n").filter((l) => l.startsWith("- "))) {
      assert.ok(allBullets.has(line.slice(2)), `CV line not in facts.js: ${line.slice(0, 60)}`);
    }
    const figures: string[] = docs.cover.replace(/WCAG \d\.\d/g, "").match(/\b\d+\.\d+s?\b|\b\d+%/g) ?? [];
    assert.deepEqual(figures.filter((n, i) => figures.indexOf(n) !== i), [], "cover letter repeats a figure");
    assert.ok(docs.cover.replace(/^<!--[\s\S]*?-->/, "").split(/\s+/).filter(Boolean).length <= 400, "cover letter over 400 words");
  });
}

test("lint flags long letters and CVs with few measured results", () => {
  const long = "<!-- kind: letter -->\n\nHi Ada,\n\n" + "We ship work. ".repeat(140);
  assert.ok(E.lint(long).some((w: string) => /under 400/.test(w)));
  const cv = "<!-- kind: cv -->\n\n" + Array.from({ length: 8 }, (_, i) => `- Built thing ${"abcdefgh"[i]} for the team`).join("\n");
  assert.ok(E.lint(cv).some((w: string) => /8 of 8 bullets have no number/.test(w)));
});
