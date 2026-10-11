import { test } from "node:test";
import assert from "node:assert/strict";
import type { CrmEvent } from "./events.ts";
import { applyEvent, replayEvent } from "./apply.ts";
import { createFakeDb } from "./test-fakes.ts";

const signup: CrmEvent = {
  event_id: "washcare:tenant:42:created",
  product: "washcare",
  type: "account.created",
  occurred_at: "2026-10-01T09:00:00.000Z",
  data: {
    account: { id: "42", name: "Clean Lagos" },
    contact: { name: "Ada" },
    subscription: { plan: "washcare", status: "trialing", amount_minor: 0, currency: "NGN", interval_months: 1 },
  },
};

const paid: CrmEvent = {
  event_id: "washcare:paystack:ps_1",
  product: "washcare",
  type: "payment.succeeded",
  occurred_at: "2026-10-05T09:00:00.000Z",
  data: {
    account: { id: "42", name: "Clean Lagos" },
    payment: { reference: "ps_1", amount_minor: 120_000, currency: "NGN", provider: "paystack", paid_at: "2026-10-05T09:00:00.000Z" },
    subscription: { plan: "washcare", status: "active", amount_minor: 120_000, currency: "NGN", interval_months: 1 },
  },
};

test("an event is applied once, and the same event_id again is a duplicate with no new rows", async () => {
  const db = createFakeDb();
  assert.deepEqual(await applyEvent(signup, db), { status: "applied" });
  assert.deepEqual(await applyEvent(signup, db), { status: "duplicate" });
  assert.equal(db.state.companies.size, 1);
  assert.equal(db.state.activities.size, 1);
  assert.equal(db.state.events.get(signup.event_id)?.status, "applied");
});

test("a newer payment moves the company to Paying and wins the deal", async () => {
  const db = createFakeDb();
  await applyEvent(signup, db);
  await applyEvent(paid, db);
  assert.equal(db.state.companies.get("washcare:42")?.stage, "Paying");
  assert.equal(db.state.deals.get("washcare:42")?.status, "won");
  assert.equal(db.state.payments.get("paystack:ps_1")?.status, "succeeded");
});

test("an older subscription event arriving late does not overwrite the newer state", async () => {
  const db = createFakeDb();
  await applyEvent(paid, db);
  await applyEvent(signup, db);
  assert.equal(db.state.subscriptions.get("washcare:42:washcare")?.status, "active");
  assert.equal(db.state.companies.get("washcare:42")?.stage, "Paying");
  assert.equal(db.state.deals.get("washcare:42")?.status, "won");
  assert.equal(db.state.activities.size, 2);
});

test("a failure marks the event failed with the reason, and replay applies it after the fix", async () => {
  const db = createFakeDb();
  db.state.failOn = "subscription";
  const result = await applyEvent(signup, db);
  assert.deepEqual(result, { status: "failed", error: "subscription failed" });
  assert.equal(db.state.events.get(signup.event_id)?.status, "failed");

  db.state.failOn = undefined;
  const row = db.state.events.get(signup.event_id)!;
  assert.deepEqual(await replayEvent(row.id, signup, db), { status: "applied" });
  assert.equal(db.state.events.get(signup.event_id)?.status, "applied");
  assert.equal(db.state.activities.size, 1);
});

test("a product with no adapter is unsupported and writes nothing", async () => {
  const db = createFakeDb();
  const result = await applyEvent({ ...signup, product: "nope", event_id: "nope:1" }, db);
  assert.deepEqual(result, { status: "unsupported" });
  assert.equal(db.state.events.size, 0);
});
