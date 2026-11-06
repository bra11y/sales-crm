import { test } from "node:test";
import assert from "node:assert/strict";
import { type Bill, budget, cleanBill, dueDates, dueLabel, money, monthTotals, nextDue, perMonth, perYear, upcoming } from "./bills.ts";

const bill = (over: Partial<Bill>): Bill => ({ id: "1", name: "Netflix", amount: 4400, currency: "NGN", cycle: "month", next_due: "2026-11-15", category: "subscription", method: null, url: null, note: null, status: "active", ...over });

test("the next due date keeps the day of the month, and uses the last day when a month is short", () => {
  assert.equal(nextDue("2026-01-31", "month"), "2026-02-28");
  assert.equal(nextDue("2026-02-28", "month", 31), "2026-03-31");
  assert.equal(nextDue("2026-11-06", "week"), "2026-11-13");
  assert.equal(nextDue("2026-11-30", "quarter"), "2027-02-28");
  assert.equal(nextDue("2026-02-28", "year"), "2027-02-28");
  assert.equal(nextDue("2026-11-06", "once"), null);
});

test("a weekly bill falls due four or five times in a month; a paused one never", () => {
  assert.deepEqual(dueDates(bill({ cycle: "week", next_due: "2026-11-02" }), "2026-11-01", "2026-11-30"), ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  assert.deepEqual(dueDates(bill({ status: "paused" }), "2026-11-01", "2026-11-30"), []);
  assert.deepEqual(dueDates(bill({ cycle: "month", next_due: "2026-12-05" }), "2026-11-01", "2026-11-30"), []);
});

test("monthly and yearly cost, whatever the cycle", () => {
  assert.equal(perMonth(bill({ cycle: "year", amount: 12000 })), 1000);
  assert.equal(perMonth(bill({ cycle: "week", amount: 1200 })), 5200);
  assert.equal(perYear(bill({ cycle: "month", amount: 4400 })), 52800);
  assert.equal(perYear(bill({ cycle: "once", amount: 900 })), 900);
});

test("this month: due, paid and left per currency, never added across currencies", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  const bills = [bill({ id: "a", amount: 4400, next_due: "2026-11-15" }), bill({ id: "b", name: "Rent", amount: 150000, next_due: "2026-12-01", category: "rent" }), bill({ id: "c", name: "Figma", amount: 15, currency: "USD", next_due: "2026-11-20" })];
  // Rent was paid on 1 November, so its next date moved to December.
  const t = monthTotals(bills, [{ id: "p", bill_id: "b", paid_on: "2026-11-01", amount: 150000, currency: "NGN" }], now);
  const ngn = t.find((x) => x.currency === "NGN")!;
  assert.deepEqual([ngn.due, ngn.paid, ngn.left], [154400, 150000, 4400]);
  assert.equal(t.find((x) => x.currency === "USD")!.left, 15);
  assert.equal(t.length, 2);
});

test("due soon lists late bills first and says how many days", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  const u = upcoming([bill({ id: "a", name: "Power", next_due: "2026-11-04" }), bill({ id: "b", next_due: "2026-11-06" }), bill({ id: "c", next_due: "2026-12-20" })], 14, now);
  assert.deepEqual(u.map((x) => [x.bill.name, dueLabel(x.days)]), [["Power", "2 days late"], ["Netflix", "Due today"]]);
});

test("budget: income less this month's bills and the savings target", () => {
  const b = budget(500000, "NGN", [{ currency: "NGN", due: 154400, paid: 150000, left: 4400, yearly: 0, count: 2 }], 20);
  assert.deepEqual(b, { bills: 154400, save: 100000, left: 245600 });
  assert.equal(budget(0, "NGN", [], 20), null);
});

test("form input is cleaned and checked, with the field to fix named", () => {
  const ok = cleanBill({ name: " Netflix ", amount: "₦4,400", currency: "ngn", cycle: "month", next_due: "2026-11-15", url: "netflix.com" });
  assert.ok(ok.ok && ok.bill.amount === 4400 && ok.bill.currency === "NGN" && ok.bill.url === "https://netflix.com/");
  const bad = cleanBill({ name: "Rent", amount: "lots", next_due: "2026-11-15" });
  assert.ok(!bad.ok && bad.field === "amount");
  assert.ok(!cleanBill({ name: "", amount: 1, next_due: "2026-11-15" }).ok);
  assert.equal(money(4400, "NGN"), "₦4,400");
  assert.equal(money(15.5, "USD"), "$15.50");
});
