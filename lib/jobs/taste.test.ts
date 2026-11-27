import { test } from "node:test";
import assert from "node:assert/strict";
import { learnTaste, tasteScore, titleWords } from "./taste.ts";

test("titles become plain words, without filler", () => {
  assert.deepEqual(titleWords("Frontend Developer (Remote, Contract) - React"), ["frontend", "developer", "react"]);
});

test("jobs you pick lift similar titles and jobs you dismiss lower them", () => {
  const taste = learnTaste([
    { title: "Frontend Developer", status: "applied" },
    { title: "Accessibility Engineer", status: "saved" },
    { title: "Frontend Engineer, Accessibility", status: "applied" },
    { title: "Sales Development Representative", status: "dismissed" },
    { title: "Sales Manager", status: "dismissed" },
    { title: "Backend Developer", status: "new" },
  ]);
  assert.ok(taste.frontend > 0 && taste.accessibility > 0);
  assert.ok(taste.sales < 0);
  assert.equal(taste.backend, undefined);
  assert.ok(tasteScore("Accessibility Frontend Developer", taste).points > 0);
  assert.ok(tasteScore("Sales Associate", taste).points < 0);
  assert.equal(tasteScore("Data Analyst", taste).points, 0);
  assert.equal(tasteScore("Anything", undefined).points, 0);
});
