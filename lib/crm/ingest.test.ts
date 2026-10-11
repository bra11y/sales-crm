import { test } from "node:test";
import assert from "node:assert/strict";
import { handleIngest } from "./ingest.ts";
import { signPayload } from "./signature.ts";
import { createFakeDb } from "./test-fakes.ts";

const now = 1_760_000_000;
const secret = "s";
const body = JSON.stringify({
  event_id: "washcare:tenant:1:created",
  product: "washcare",
  type: "account.created",
  occurred_at: "2026-10-11T09:00:00.000Z",
  data: { account: { id: "1", name: "A" } },
});
const signed = (b: string) => ({ timestamp: String(now), signature: signPayload(secret, String(now), b) });

test("a signed event is accepted and applied", async () => {
  const res = await handleIngest({ product: "washcare", rawBody: body, ...signed(body), nowSeconds: now, secret, db: createFakeDb() });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "applied");
});

test("a product with no secret configured is 404", async () => {
  const res = await handleIngest({ product: "washcare", rawBody: body, ...signed(body), nowSeconds: now, secret: undefined, db: createFakeDb() });
  assert.equal(res.status, 404);
});

test("a bad product name is 404 before anything else", async () => {
  const res = await handleIngest({ product: "../x", rawBody: body, ...signed(body), nowSeconds: now, secret, db: createFakeDb() });
  assert.equal(res.status, 404);
});

test("a bad signature is 401 and writes nothing", async () => {
  const db = createFakeDb();
  const res = await handleIngest({ product: "washcare", rawBody: body, timestamp: String(now), signature: "00", nowSeconds: now, secret, db });
  assert.equal(res.status, 401);
  assert.equal(db.state.events.size, 0);
});

test("an event for another product than the path is 400", async () => {
  const other = body.replaceAll("washcare", "bihub");
  const res = await handleIngest({ product: "washcare", rawBody: other, ...signed(other), nowSeconds: now, secret, db: createFakeDb() });
  assert.equal(res.status, 400);
});

test("a body over 64 KB is 413", async () => {
  const big = "x".repeat(65 * 1024);
  const res = await handleIngest({ product: "washcare", rawBody: big, ...signed(big), nowSeconds: now, secret, db: createFakeDb() });
  assert.equal(res.status, 413);
});

test("a repeat is 200 with status duplicate, so the sender does not retry", async () => {
  const db = createFakeDb();
  await handleIngest({ product: "washcare", rawBody: body, ...signed(body), nowSeconds: now, secret, db });
  const res = await handleIngest({ product: "washcare", rawBody: body, ...signed(body), nowSeconds: now, secret, db });
  assert.deepEqual([res.status, res.body.status], [200, "duplicate"]);
});
