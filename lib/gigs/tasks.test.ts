import { test } from "node:test";
import assert from "node:assert/strict";
import { sortedSites, TASK_SITES } from "./tasks.ts";

test("every task site links to https pages and has a source", () => {
  for (const s of TASK_SITES) {
    assert.match(s.url, /^https:\/\//, s.name);
    assert.match(s.source, /^https:\/\//, s.name);
    assert.ok(s.note.length > 10, s.name);
  }
});

test("open AI work comes first and closed sites come last", () => {
  const sorted = sortedSites();
  assert.equal(sorted[0].open, "yes");
  assert.equal(sorted[0].kind, "ai");
  assert.ok(sorted.slice(-2).every((s) => s.open === "no"));
});
