import { test } from "node:test";
import assert from "node:assert/strict";
import { currencySymbol, formatTotals } from "./currency.ts";

test("currencySymbol gives the narrow symbol", () => {
  assert.equal(currencySymbol("NGN"), "₦");
  assert.equal(currencySymbol("USD"), "$");
});

test("formatTotals never adds different currencies together", () => {
  assert.equal(
    formatTotals([
      { value: 1000, currency: "NGN" },
      { value: 500, currency: "NGN" },
      { value: 20, currency: "USD" },
    ]),
    "₦1,500 · $20",
  );
});

test("formatTotals of nothing is zero naira", () => {
  assert.equal(formatTotals([]), "₦0");
});
