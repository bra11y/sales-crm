import { test } from "node:test";
import assert from "node:assert/strict";
import F from "./facts.js";
import E from "./engine.js";
import { atsCheck, postTerms } from "./ats.ts";

const JD = "Senior Accessibility Engineer\nAcme Health is hiring.\n- WCAG 2.2 audits with NVDA and JAWS\n- Build React components in TypeScript\n- Experience with Cypress and GraphQL";

test("post terms pick tool names and skip noise", () => {
  const t = postTerms("We use React, Next.js and GraphQL. WCAG and ADA. Remote in the US or EU. HR will call.");
  for (const k of ["Next.js", "GraphQL", "WCAG", "ADA"]) assert.ok(t.includes(k), k);
  for (const k of ["US", "EU", "HR"]) assert.ok(!t.includes(k), k);
});

test("the ATS check scores a real CV and names what is missing", () => {
  const a = E.analyze(JD, F);
  const role = "Senior Accessibility Engineer";
  const cv = E.makeCV(a, { jd: JD, company: "Acme Health", role, manager: "", why: "" }, F);
  const r = atsCheck(cv, JD, { role, matched: a.matched.map((m: { label: string }) => m.label), said: a.matched.map((m: { said: string }) => m.said), gaps: a.gaps });
  assert.ok(r.score >= 60 && r.score <= 100, `score ${r.score}`);
  assert.ok(r.found.includes("WCAG"));
  // Gaps are never counted as missing keywords: the CV must not claim them.
  for (const g of a.gaps) assert.ok(!r.missing.includes(g), g);
  assert.ok(r.items.find((i) => i.id === "sections")?.ok);
  assert.ok(r.items.find((i) => i.id === "contact")?.ok);
  assert.ok(r.items.find((i) => i.id === "title")?.ok);
});

test("a thin CV scores low and gets clear fixes", () => {
  const r = atsCheck("# Name\n\n## Work\n\n### Dev\n\n- Did things\n\n| a | b |", JD, { role: "Accessibility Engineer", matched: ["WCAG"], gaps: [] });
  assert.ok(r.score < 40, `score ${r.score}`);
  assert.match(r.items.find((i) => i.id === "sections")!.detail, /experience, education, skills/);
  assert.equal(r.items.find((i) => i.id === "layout")!.ok, false);
});
