import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSteps, daysLeft, dueText, progress, sortScholarships, steps } from "./grow.ts";

const now = new Date("2026-10-26T09:00:00Z");

test("deadlines count whole days and say when they have passed", () => {
  assert.equal(daysLeft("2026-10-26", now), 0);
  assert.equal(dueText("2026-10-26", now), "Closes today");
  assert.equal(dueText("2026-10-27", now), "Closes tomorrow");
  assert.equal(dueText("2026-11-05", now), "10 days left");
  assert.equal(dueText("2026-10-20", now), "Closed 6 days ago");
  assert.equal(dueText(null, now), "No deadline set");
});

test("open scholarships come first, soonest deadline first", () => {
  const list = [
    { id: "won", deadline: "2026-10-27", status: "won" as const },
    { id: "late", deadline: "2026-12-01", status: "interested" as const },
    { id: "closed", deadline: "2026-10-01", status: "preparing" as const },
    { id: "soon", deadline: "2026-10-30", status: "preparing" as const },
    { id: "none", deadline: null, status: "interested" as const },
  ];
  assert.deepEqual(
    sortScholarships(list, now).map((s) => s.id),
    ["soon", "late", "none", "closed", "won"],
  );
});

test("steps are cleaned before saving and progress is a percentage", () => {
  assert.deepEqual(cleanSteps([{ text: "  Ask referees ", done: 1 }, { text: "" }]), [{ text: "Ask referees", done: true }]);
  assert.equal(cleanSteps("nope"), null);
  assert.equal(cleanSteps(Array.from({ length: 31 }, () => ({ text: "x" }))), null);
  assert.equal(progress([...steps(["a", "b", "c"]), { text: "d", done: true }]), 25);
});
