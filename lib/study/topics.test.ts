import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_TOPICS, CATEGORIES, readLesson, topicsFor } from "./topics.ts";

test("80 topics in 8 categories, each with its own slug", () => {
  assert.equal(CATEGORIES.length, 8);
  assert.equal(ALL_TOPICS.length, 80);
  assert.equal(new Set(ALL_TOPICS.map((t) => t.slug)).size, 80);
});

test("three a day from different categories, and every topic within 27 days", () => {
  const today = topicsFor("2026-11-27");
  assert.equal(today.length, 3);
  assert.equal(new Set(today.map((t) => t.categoryId)).size, 3);
  const seen = new Set<string>();
  for (let d = 0; d < 27; d++) for (const t of topicsFor(new Date(Date.parse("2026-11-27") + d * 86_400_000).toISOString().slice(0, 10))) seen.add(t.slug);
  assert.equal(seen.size, 80);
});

test("a lesson needs an explanation, an example, a use and a flow of 3 steps or more", () => {
  const ok = readLesson('{"explain":"A.","example":"B.","use":"C.","question":"D?","flow":["one","two","three"]}', "t");
  assert.equal(ok?.flow.length, 3);
  assert.equal(readLesson('{"explain":"A.","example":"B.","use":"C.","flow":["one"]}', "t"), null);
  assert.equal(readLesson("no json", "t"), null);
});
