import { test } from "node:test";
import assert from "node:assert/strict";
import { annualisedMinor, formatMoney, monthlyMinor } from "./money.ts";

test("monthly value divides the term and rounds to whole kobo", () => {
  assert.equal(monthlyMinor(1_080_000, 12), 90_000);
  assert.equal(monthlyMinor(100_000, 3), 33_333);
});

test("annualised value scales any term to twelve months", () => {
  assert.equal(annualisedMinor(120_000, 1), 1_440_000);
  assert.equal(annualisedMinor(300_000, 3), 1_200_000);
});

test("formatMoney shows naira from kobo", () => {
  assert.equal(formatMoney(1_250_050, "NGN"), "₦12,500.50");
});
