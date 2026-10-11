import { test } from "node:test";
import assert from "node:assert/strict";
import { currenciesIn, effectiveStatus, overviewFigures, type PaymentRow, type SubscriptionRow } from "./overview.ts";

const now = new Date("2026-10-11T12:00:00.000Z");
const from = new Date("2026-10-01T00:00:00.000Z");
const to = new Date("2026-10-12T00:00:00.000Z");

const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  company_id: "c",
  product: "washcare",
  plan: "washcare",
  status: "active",
  amount_minor: 120_000,
  currency: "NGN",
  interval_months: 1,
  renews_at: null,
  cancelled_at: null,
  ...over,
});

const pay = (over: Partial<PaymentRow>): PaymentRow => ({
  company_id: "c",
  product: "washcare",
  amount_minor: 120_000,
  currency: "NGN",
  status: "succeeded",
  paid_at: "2026-10-05T10:00:00.000Z",
  ...over,
});

test("a trial past its end date with no new event reads as Trial ended", () => {
  assert.equal(effectiveStatus(sub({ status: "trialing", renews_at: "2026-10-10T00:00:00.000Z" }), now), "Trial ended");
  assert.equal(effectiveStatus(sub({ status: "trialing", renews_at: "2026-10-15T00:00:00.000Z" }), now), "Trial");
});

test("MRR adds monthly values across mixed terms, active only", () => {
  const f = overviewFigures({
    subscriptions: [
      sub({ company_id: "a" }),
      sub({ company_id: "b", amount_minor: 1_080_000, interval_months: 12 }),
      sub({ company_id: "c", amount_minor: 300_000, interval_months: 3 }),
      sub({ company_id: "d", status: "trialing", renews_at: "2026-10-15T00:00:00.000Z" }),
    ],
    payments: [],
    from,
    to,
    now,
    currency: "NGN",
  });
  assert.equal(f.mrrMinor, 120_000 + 90_000 + 100_000);
  assert.equal(f.activeSubscriptions, 3);
  assert.equal(f.trialsEndingSoon, 1);
});

test("ended trials are counted apart and never as ending soon", () => {
  const f = overviewFigures({ subscriptions: [sub({ status: "trialing", renews_at: "2026-10-09T00:00:00.000Z" })], payments: [], from, to, now, currency: "NGN" });
  assert.deepEqual([f.trialsEndingSoon, f.trialsEnded], [0, 1]);
});

test("revenue counts succeeded payments in range and in the chosen currency only", () => {
  const f = overviewFigures({
    subscriptions: [],
    payments: [pay({}), pay({ paid_at: "2026-09-20T00:00:00.000Z" }), pay({ currency: "USD", amount_minor: 5_000 }), pay({ status: "failed" })],
    from,
    to,
    now,
    currency: "NGN",
  });
  assert.equal(f.revenueMinor, 120_000);
  assert.equal(f.failedPayments, 1);
});

test("a new paid account is one whose first successful payment falls in range", () => {
  const f = overviewFigures({
    subscriptions: [],
    payments: [pay({ company_id: "old", paid_at: "2026-09-01T00:00:00.000Z" }), pay({ company_id: "old" }), pay({ company_id: "new" })],
    from,
    to,
    now,
    currency: "NGN",
  });
  assert.equal(f.newPaidAccounts, 1);
});

test("cancellations count cancelled_at in range", () => {
  const f = overviewFigures({ subscriptions: [sub({ status: "cancelled", cancelled_at: "2026-10-03T00:00:00.000Z" })], payments: [], from, to, now, currency: "NGN" });
  assert.equal(f.cancellations, 1);
});

test("the product filter limits every figure", () => {
  const f = overviewFigures({ subscriptions: [sub({}), sub({ product: "bihub" })], payments: [pay({ product: "bihub" })], from, to, now, currency: "NGN", product: "washcare" });
  assert.deepEqual([f.activeSubscriptions, f.revenueMinor], [1, 0]);
});

test("currenciesIn lists each currency once, NGN first when present", () => {
  assert.deepEqual(currenciesIn([sub({ currency: "USD" })], [pay({})]), ["NGN", "USD"]);
});
