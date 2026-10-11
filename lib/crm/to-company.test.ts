import { test } from "node:test";
import assert from "node:assert/strict";
import { toCompany, type CompanyListRow } from "./to-company.ts";

const row: CompanyListRow = {
  id: "c1",
  product: "washcare",
  name: "Clean Lagos",
  stage: "Paying",
  segment: "Yearly",
  owner_name: "Bryan Temple Onyenghan",
  open_deals: 0,
  pipeline_value_minor: 1_080_000,
  currency: "NGN",
  win_probability: 100,
  last_interaction_at: "2026-10-09T10:00:00.000Z",
  last_interaction_label: "Paid ₦10,800.00",
  trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2],
};

test("activity days count from now, not from a fixed date", () => {
  const company = toCompany(row, new Date("2026-10-11T10:00:00.000Z"));
  assert.equal(company.activityDays, 2);
});

test("money comes out in major units for the existing table", () => {
  assert.equal(toCompany(row, new Date("2026-10-11T10:00:00.000Z")).pipelineValue, 10_800);
});

test("tags are segment then stage, skipping empty ones", () => {
  assert.deepEqual(toCompany(row, new Date()).tags, ["Yearly", "Paying"]);
  assert.deepEqual(toCompany({ ...row, segment: null }, new Date()).tags, ["Paying"]);
});

test("a company with no activity is far outside any window and says so", () => {
  const company = toCompany({ ...row, last_interaction_at: null, last_interaction_label: null, trend: null }, new Date("2026-10-11T10:00:00.000Z"));
  assert.equal(company.lastInteraction.label, "No activity yet");
  assert.equal(company.activityDays, Number.MAX_SAFE_INTEGER);
  assert.equal(company.trend.length, 14);
});

test("no owner reads as Unassigned", () => {
  assert.equal(toCompany({ ...row, owner_name: null }, new Date()).owner, "Unassigned");
});

test("the company keeps its currency so the table never shows a wrong symbol", () => {
  assert.equal(toCompany(row, new Date()).currency, "NGN");
});
