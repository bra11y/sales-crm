import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, verifySignature } from "./signature.ts";

const secret = "test-secret";
const body = '{"event_id":"washcare:x"}';
const now = 1_760_000_000;

test("a correct signature passes", () => {
  const signature = signPayload(secret, String(now), body);
  assert.deepEqual(verifySignature({ secret, timestamp: String(now), signature, body, nowSeconds: now }), { ok: true });
});

test("a body changed after signing fails, even by one space", () => {
  const signature = signPayload(secret, String(now), body);
  const result = verifySignature({ secret, timestamp: String(now), signature, body: `${body} `, nowSeconds: now });
  assert.equal(result.ok, false);
});

test("a wrong secret fails", () => {
  const signature = signPayload("other", String(now), body);
  assert.equal(verifySignature({ secret, timestamp: String(now), signature, body, nowSeconds: now }).ok, false);
});

test("a timestamp more than 300 seconds old fails", () => {
  const then = String(now - 301);
  const signature = signPayload(secret, then, body);
  const result = verifySignature({ secret, timestamp: then, signature, body, nowSeconds: now });
  assert.deepEqual(result, { ok: false, reason: "The request is too old or from the future." });
});

test("missing headers fail without throwing", () => {
  assert.equal(verifySignature({ secret, timestamp: null, signature: null, body, nowSeconds: now }).ok, false);
});

test("a signature of the wrong length fails without throwing", () => {
  assert.equal(verifySignature({ secret, timestamp: String(now), signature: "abc", body, nowSeconds: now }).ok, false);
});
