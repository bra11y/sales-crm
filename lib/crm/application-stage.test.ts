import { test } from "node:test";
import assert from "node:assert/strict";
import { APPLICATION_STAGES, stageChange } from "./application-stage.ts";

test("the stages run in the order an application moves", () => {
  assert.deepEqual(APPLICATION_STAGES, ["Drafted", "Applied", "Interview", "Offer", "Won", "Closed"]);
});

test("moving to Interview raises the win chance and keeps the deal open", () => {
  assert.deepEqual(stageChange("Interview", "  Call with Ada on Tuesday  "), {
    ok: true,
    stage: "Interview",
    winProbability: 30,
    dealStatus: "open",
    summary: "Moved to Interview: Call with Ada on Tuesday",
  });
});

test("Won closes the deal as won and Closed closes it as lost", () => {
  const won = stageChange("Won", "");
  const closed = stageChange("Closed", "");
  assert.equal(won.ok && won.dealStatus, "won");
  assert.equal(won.ok && won.summary, "Moved to Won");
  assert.equal(closed.ok && closed.dealStatus, "lost");
});

test("an unknown stage or an over-long note is refused", () => {
  assert.deepEqual(stageChange("Hired", ""), { ok: false, error: "Pick one of the application stages." });
  assert.deepEqual(stageChange("Offer", "x".repeat(501)), { ok: false, error: "Keep the note under 500 characters." });
});
