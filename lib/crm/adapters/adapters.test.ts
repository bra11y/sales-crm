import { test } from "node:test";
import assert from "node:assert/strict";
import type { CrmEvent } from "../events.ts";
import { adapterFor } from "./index.ts";

const at = "2026-10-11T09:00:00.000Z";

function event(partial: Partial<CrmEvent> & Pick<CrmEvent, "type" | "product">): CrmEvent {
  return {
    event_id: `${partial.product}:test`,
    occurred_at: at,
    data: { account: { id: "42", name: "Clean Lagos" } },
    ...partial,
  };
}

test("unknown products have no adapter", () => {
  assert.equal(adapterFor("nope"), null);
});

test("a Washcare sign-up becomes a Trial company with a contact, a trialing subscription and an activity", () => {
  const m = adapterFor("washcare")!(
    event({
      product: "washcare",
      type: "account.created",
      data: {
        account: { id: "42", name: "Clean Lagos" },
        contact: { name: "Ada", email: "ada@clean.ng", phone: "+2348000000000" },
        subscription: { plan: "washcare", status: "trialing", amount_minor: 0, currency: "NGN", interval_months: 1, renews_at: "2026-10-18T09:00:00.000Z" },
      },
    }),
  );
  assert.deepEqual(m.map((x) => x.kind), ["company", "contact", "subscription", "deal", "activity"]);
  assert.deepEqual(m[0], { kind: "company", externalId: "42", name: "Clean Lagos", stage: "Trial", segment: "Monthly", winProbability: 40, pipelineValueMinor: 0, currency: "NGN", sourceAt: at });
  assert.equal(m[3].kind === "deal" && m[3].status, "open");
  assert.equal(m[4].kind === "activity" && m[4].summary, "Signed up");
});

test("a Washcare payment for an account the CRM never saw still creates the company first", () => {
  const m = adapterFor("washcare")!(
    event({
      product: "washcare",
      type: "payment.succeeded",
      data: {
        account: { id: "77", name: "Fresh Fold" },
        payment: { reference: "ps_1", amount_minor: 1_080_000, currency: "NGN", provider: "paystack", paid_at: at },
        subscription: { plan: "washcare", status: "active", amount_minor: 1_080_000, currency: "NGN", interval_months: 12 },
      },
    }),
  );
  assert.equal(m[0].kind, "company");
  assert.equal(m[0].kind === "company" && m[0].stage, "Paying");
  assert.equal(m[0].kind === "company" && m[0].segment, "Yearly");
  assert.equal(m[0].kind === "company" && m[0].pipelineValueMinor, 1_080_000);
  assert.ok(m.some((x) => x.kind === "payment" && x.reference === "ps_1" && x.status === "succeeded"));
  assert.ok(m.some((x) => x.kind === "deal" && x.status === "won"));
  assert.ok(m.some((x) => x.kind === "activity" && x.summary === "Paid ₦10,800.00"));
});

test("a Washcare demo request is a Demo requested lead", () => {
  const m = adapterFor("washcare")!(
    event({ product: "washcare", type: "lead.captured", data: { account: { id: "demo:9", name: "Spin City" }, contact: { name: "Tolu" } } }),
  );
  assert.equal(m[0].kind === "company" && m[0].stage, "Demo requested");
  assert.equal(m[0].kind === "company" && m[0].winProbability, 20);
  assert.ok(m.some((x) => x.kind === "activity" && x.summary === "Requested a demo"));
});

test("a past-due Washcare subscription is Locked, and cancelled is Cancelled with a lost deal", () => {
  const sub = { plan: "washcare", amount_minor: 120_000, currency: "NGN", interval_months: 1 as const };
  const locked = adapterFor("washcare")!(event({ product: "washcare", type: "subscription.changed", data: { account: { id: "1", name: "A" }, subscription: { ...sub, status: "past_due" } } }));
  const cancelled = adapterFor("washcare")!(event({ product: "washcare", type: "subscription.changed", data: { account: { id: "1", name: "A" }, subscription: { ...sub, status: "cancelled" } } }));
  assert.equal(locked[0].kind === "company" && locked[0].stage, "Locked");
  assert.equal(cancelled[0].kind === "company" && cancelled[0].stage, "Cancelled");
  assert.ok(cancelled.some((x) => x.kind === "deal" && x.status === "lost"));
});

test("a Lux event is always the Client stage", () => {
  const m = adapterFor("lux")!(event({ product: "lux", type: "account.created" }));
  assert.equal(m[0].kind === "company" && m[0].stage, "Client");
  assert.equal(m[0].kind === "company" && m[0].segment, "Managed client");
});

test("a Bihub store is Store created on the Free segment, and Pro after payment", () => {
  const created = adapterFor("bihub")!(event({ product: "bihub", type: "account.created" }));
  assert.equal(created[0].kind === "company" && created[0].stage, "Store created");
  assert.equal(created[0].kind === "company" && created[0].segment, "Free");
  const paid = adapterFor("bihub")!(
    event({
      product: "bihub",
      type: "payment.succeeded",
      data: {
        account: { id: "s1", name: "Ade Fabrics" },
        payment: { reference: "bh_1", amount_minor: 500_000, currency: "NGN", provider: "paystack", paid_at: at },
        subscription: { plan: "pro", status: "active", amount_minor: 500_000, currency: "NGN", interval_months: 1 },
      },
    }),
  );
  assert.equal(paid[0].kind === "company" && paid[0].stage, "Pro");
  assert.equal(paid[0].kind === "company" && paid[0].segment, "Pro");
});

test("a failed payment records a failed payment and an activity, and leaves stage alone", () => {
  const m = adapterFor("washcare")!(
    event({
      product: "washcare",
      type: "payment.failed",
      data: { account: { id: "1", name: "A" }, payment: { reference: "f1", amount_minor: 120_000, currency: "NGN", provider: "paystack", paid_at: at } },
    }),
  );
  assert.equal(m[0].kind === "company" && m[0].stage, undefined);
  assert.ok(m.some((x) => x.kind === "payment" && x.status === "failed"));
  assert.ok(m.some((x) => x.kind === "activity" && x.summary === "Payment failed: ₦1,200.00"));
});
