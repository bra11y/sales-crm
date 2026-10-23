import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGoal, goalProgress, periodBounds, type Goal } from "./goals.ts";
import { byDay, historyCsv, kindOf, type HistoryItem } from "./history.ts";
import { monthlySeries, projectNext, renewalsDue, trialConversion, weightedPipeline } from "./forecast.ts";
import type { PaymentRow, SubscriptionRow } from "./overview.ts";

const now = new Date("2026-10-23T12:00:00.000Z"); // a Friday

test("weeks start on Monday, months on the 1st, quarters on Jan/Apr/Jul/Oct", () => {
  assert.equal(periodBounds("week", now).from.toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(periodBounds("week", now, 1).from.toISOString(), "2026-10-12T00:00:00.000Z");
  assert.equal(periodBounds("month", now).to.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(periodBounds("month", now, 10).from.toISOString(), "2025-12-01T00:00:00.000Z");
  assert.equal(periodBounds("quarter", now).from.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(periodBounds("quarter", now, 1).label, "Q3 2026");
});

const goal = (over: Partial<Goal> = {}): Goal => ({ id: "g", metric: "applications", period: "week", target: 10, currency: null, product: null, note: null, created_at: "2026-01-01", ...over });

test("progress compares the count with the pace expected by today", () => {
  const samples = Array.from({ length: 6 }, (_, i) => ({ at: `2026-10-2${i % 3}T09:00:00Z`, value: 1 }));
  const p = goalProgress(goal(), samples, now);
  assert.equal(p.actual, 6);
  assert.equal(p.pct, 60);
  assert.equal(p.status, "on_track"); // 4.5 of 7 days gone: 6.4 expected, 6 is within 10%
  assert.equal(p.daysLeft, 3);
  assert.equal(p.history.length, 6);
  assert.ok(p.history.at(-1)!.current);
});

test("behind pace, reached, and a streak of past periods hit", () => {
  assert.equal(goalProgress(goal(), [{ at: "2026-10-20T09:00:00Z", value: 2 }], now).status, "behind");
  assert.equal(goalProgress(goal({ target: 2 }), [{ at: "2026-10-20T09:00:00Z", value: 2 }], now).status, "done");
  const past = [{ at: "2026-10-13T09:00:00Z", value: 10 }, { at: "2026-10-06T09:00:00Z", value: 10 }, { at: "2026-09-22T09:00:00Z", value: 10 }];
  assert.equal(goalProgress(goal(), past, now).streak, 2);
});

test("a revenue goal counts only its own currency and product", () => {
  const g = goal({ metric: "revenue", period: "month", target: 100_000, currency: "NGN", product: "washcare" });
  const samples = [
    { at: "2026-10-02T00:00:00Z", value: 50_000, currency: "NGN", product: "washcare" },
    { at: "2026-10-02T00:00:00Z", value: 90_000, currency: "USD", product: "washcare" },
    { at: "2026-10-02T00:00:00Z", value: 90_000, currency: "NGN", product: "bihub" },
  ];
  assert.equal(goalProgress(g, samples, now).actual, 50_000);
});

test("goal input is checked and money targets go to minor units", () => {
  const ok = checkGoal({ metric: "revenue", period: "month", target: 2500.5, currency: "usd" });
  assert.ok(ok.ok && ok.goal.target === 250_050 && ok.goal.currency === "USD");
  assert.equal(checkGoal({ metric: "revenue", period: "month", target: 10 }).ok, false);
  assert.equal(checkGoal({ metric: "applications", period: "year", target: 10 }).ok, false);
  assert.equal(checkGoal({ metric: "applications", period: "week", target: 0 }).ok, false);
  const count = checkGoal({ metric: "applications", period: "week", target: 20, currency: "USD" });
  assert.ok(count.ok && count.goal.currency === null);
});

test("history groups by day, newest first, and adds money in per currency", () => {
  const items: HistoryItem[] = [
    { id: "1", at: "2026-10-23T08:00:00Z", kind: "money", title: "Paid", amountMinor: 5000, currency: "NGN" },
    { id: "2", at: "2026-10-23T10:00:00Z", kind: "money", title: "Paid", amountMinor: 700, currency: "USD" },
    { id: "3", at: "2026-10-23T11:00:00Z", kind: "money", title: "Failed", amountMinor: 900, currency: "NGN", failed: true },
    { id: "4", at: "2026-10-22T11:00:00Z", kind: "note", title: "Called" },
    { id: "5", at: "2026-10-01T11:00:00Z", kind: "application", title: "Sent" },
  ];
  const days = byDay(items, now);
  assert.deepEqual(days.map((d) => d.label), ["Today", "Yesterday", "Thu 1 Oct"]);
  assert.equal(days[0].items[0].id, "3");
  assert.deepEqual(days[0].paid, { NGN: 5000, USD: 700 });
});

test("activity kinds map to timeline groups", () => {
  assert.equal(kindOf("payment.failed"), "money");
  assert.equal(kindOf("application.sent"), "application");
  assert.equal(kindOf("note"), "note");
  assert.equal(kindOf("subscription.changed"), "pipeline");
});

test("CSV escapes commas and blocks spreadsheet formulas", () => {
  const csv = historyCsv([{ id: "1", at: "2026-10-23", kind: "note", title: "=HYPERLINK(1)", companyName: "A, B" }]);
  assert.match(csv, /"'=HYPERLINK\(1\)"/);
  assert.match(csv, /"A, B"/);
});

const pay = (over: Partial<PaymentRow>): PaymentRow => ({ company_id: "c", product: "washcare", amount_minor: 1000, currency: "NGN", status: "succeeded", paid_at: "2026-10-05T00:00:00Z", ...over });
const sub = (over: Partial<SubscriptionRow> & { company_name?: string }) => ({ company_id: "c", product: "washcare", plan: "p", status: "active" as const, amount_minor: 3000, currency: "NGN", interval_months: 3, renews_at: null, cancelled_at: null, company_name: "C", ...over });

test("monthly series covers 12 months and keeps failed money apart", () => {
  const s = monthlySeries([pay({}), pay({ status: "failed", amount_minor: 400 }), pay({ paid_at: "2025-10-30T00:00:00Z" }), pay({ currency: "USD" })], "NGN", now);
  assert.equal(s.length, 12);
  assert.equal(s[0].key, "2025-11");
  assert.deepEqual([s[11].paidMinor, s[11].failedMinor, s[11].count], [1000, 400, 1]);
});

test("weighted pipeline multiplies value by win chance, by stage", () => {
  const w = weightedPipeline(
    [
      { product: "applications", stage: "Interview", valueMinor: 10_000, currency: "USD", winProbability: 30 },
      { product: "applications", stage: "Applied", valueMinor: 10_000, currency: "USD", winProbability: 10 },
      { product: "applications", stage: "Applied", valueMinor: 10_000, currency: "NGN", winProbability: 10 },
    ],
    "USD",
    { applications: ["Applied", "Interview"] },
  );
  assert.deepEqual(w.byStage.map((t) => t.stage), ["Applied", "Interview"]);
  assert.equal(w.weightedMinor, 4000);
});

test("renewals, trial conversion and the projection", () => {
  const subs = [
    sub({ renews_at: "2026-10-30T00:00:00Z" }),
    sub({ company_id: "t", status: "trialing", renews_at: "2026-10-25T00:00:00Z", amount_minor: 1000, interval_months: 1 }),
    sub({ company_id: "x", status: "cancelled" }),
    sub({ company_id: "far", renews_at: "2027-03-01T00:00:00Z" }),
  ];
  assert.deepEqual(renewalsDue(subs, "NGN", now, 30).map((r) => r.companyId), ["t", "c"]);
  assert.equal(trialConversion(subs, "NGN", now), 2 / 3);
  const p = projectNext(subs, "NGN", now);
  assert.equal(p.mrrMinor, 2000);
  assert.equal(p.months[0].label, "Nov");
  assert.equal(p.trialMinor, Math.round(1000 * (2 / 3)));
});
