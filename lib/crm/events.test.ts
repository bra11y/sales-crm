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

const application = {
  event_id: "applications:northwind:2026-10-17T15:00:00.000Z",
  product: "applications",
  type: "application.sent",
  occurred_at: "2026-10-17T15:00:00.000Z",
  data: {
    account: { id: "northwind-outfitters", name: "Northwind Outfitters" },
    segment: "Contract",
    application: {
      role: "Accessibility Consultant",
      track: "Accessibility",
      documents: { cv: "# Bryan Temple Onyenghan", proposal: "# Proposal" },
      job_post: "Audit our Shopify store",
      matched: ["WCAG 2.2 AA", "Shopify"],
      gaps: ["lottie"],
    },
  },
};

test("an application event with its documents parses", () => {
  const result = parseEvent(JSON.stringify(application));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.event.data.application?.role, "Accessibility Consultant");
});

test("an application event needs data.application", () => {
  const data = { account: application.data.account, segment: application.data.segment };
  const result = parseEvent(JSON.stringify({ ...application, data }));
  assert.deepEqual(result, { ok: false, reason: "An application event needs data.application." });
});

test("an application must carry at least one known document", () => {
  const bad = { ...application, data: { ...application.data, application: { ...application.data.application, documents: { letter: "x" } } } };
  const result = parseEvent(JSON.stringify(bad));
  assert.deepEqual(result, { ok: false, reason: "data.application.documents needs a cv, cover or proposal." });
});

test("an oversized document is refused", () => {
  const big = "x".repeat(60_001);
  const bad = { ...application, data: { ...application.data, application: { ...application.data.application, documents: { cv: big } } } };
  const result = parseEvent(JSON.stringify(bad));
  assert.deepEqual(result, { ok: false, reason: "data.application.documents.cv is missing or over 60000 characters." });
});
