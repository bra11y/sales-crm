import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEvent } from "./events.ts";

const valid = {
  event_id: "washcare:tenant:42:created",
  product: "washcare",
  type: "account.created",
  occurred_at: "2026-10-11T09:00:00.000Z",
  data: { account: { id: "42", name: "Clean Lagos" } },
};

test("a valid event parses", () => {
  const result = parseEvent(JSON.stringify(valid));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.event.data.account.name, "Clean Lagos");
});

test("broken JSON is refused with a reason", () => {
  assert.deepEqual(parseEvent("{"), { ok: false, reason: "The body is not valid JSON." });
});

test("an unknown type is refused", () => {
  const result = parseEvent(JSON.stringify({ ...valid, type: "order.created" }));
  assert.deepEqual(result, { ok: false, reason: "Unknown event type: order.created." });
});

test("an event_id without the product prefix is refused", () => {
  const result = parseEvent(JSON.stringify({ ...valid, event_id: "tenant:42:created" }));
  assert.equal(result.ok, false);
});

test("a missing account name is refused", () => {
  const result = parseEvent(JSON.stringify({ ...valid, data: { account: { id: "42" } } }));
  assert.equal(result.ok, false);
});

test("a bad date is refused", () => {
  assert.equal(parseEvent(JSON.stringify({ ...valid, occurred_at: "yesterday" })).ok, false);
});

test("a payment with a fractional amount is refused", () => {
  const event = {
    ...valid,
    type: "payment.succeeded",
    data: {
      account: { id: "42", name: "Clean Lagos" },
      payment: { reference: "r1", amount_minor: 10.5, currency: "NGN", provider: "paystack", paid_at: valid.occurred_at },
    },
  };
  assert.equal(parseEvent(JSON.stringify(event)).ok, false);
});

test("a payment event without payment data is refused", () => {
  const result = parseEvent(JSON.stringify({ ...valid, type: "payment.succeeded" }));
  assert.deepEqual(result, { ok: false, reason: "A payment event needs data.payment." });
});

test("a subscription with an unsupported interval is refused", () => {
  const event = {
    ...valid,
    type: "subscription.changed",
    data: {
      account: { id: "42", name: "Clean Lagos" },
      subscription: { plan: "washcare", status: "active", amount_minor: 100, currency: "NGN", interval_months: 2 },
    },
  };
  assert.equal(parseEvent(JSON.stringify(event)).ok, false);
});
