import { test } from "node:test";
import assert from "node:assert/strict";
import { newCompanyRows } from "./new-company.ts";

const input = {
  name: "  Acme Lagos ",
  segment: "SMB",
  stage: "Pilot",
  pipelineValue: 2500.5,
  winProbability: 140,
  interactionDate: "2026-10-10",
  interactionType: "Call",
};

test("a valid company becomes a direct company, a deal and a dated activity", () => {
  const result = newCompanyRows(input, { ownerId: "u1", externalId: "x1", today: "2026-10-11" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.company, {
    workspace_id: 1,
    product: "direct",
    external_id: "x1",
    name: "Acme Lagos",
    segment: "SMB",
    stage: "Pilot",
    owner_id: "u1",
    pipeline_value_minor: 250050,
    currency: "NGN",
    win_probability: 100,
  });
  assert.deepEqual(result.deal, { stage: "Pilot", value_minor: 250050, currency: "NGN", status: "open" });
  assert.deepEqual(result.activity, { kind: "manual", summary: "Call", at: "2026-10-10T12:00:00.000Z" });
});

test("an empty name is refused with a message naming the field", () => {
  const result = newCompanyRows({ ...input, name: "  " }, { ownerId: "u1", externalId: "x1", today: "2026-10-11" });
  assert.deepEqual(result, { ok: false, error: "Company name: enter a name." });
});

test("no pipeline value means no deal, and a future date is pulled back to today", () => {
  const result = newCompanyRows({ ...input, pipelineValue: 0, interactionDate: "2027-01-01" }, { ownerId: null, externalId: "x1", today: "2026-10-11" });
  assert.equal(result.ok && result.deal, null);
  assert.equal(result.ok && result.activity.at, "2026-10-11T12:00:00.000Z");
});

test("a negative or missing value counts as zero", () => {
  const result = newCompanyRows({ ...input, pipelineValue: Number.NaN }, { ownerId: null, externalId: "x1", today: "2026-10-11" });
  assert.equal(result.ok && result.company.pipeline_value_minor, 0);
});
