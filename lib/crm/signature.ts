import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyInput = {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds: number;
  toleranceSeconds?: number;
};

export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifySignature({
  secret,
  timestamp,
  signature,
  body,
  nowSeconds,
  toleranceSeconds = 300,
}: VerifyInput): { ok: true } | { ok: false; reason: string } {
  if (!timestamp || !signature) return { ok: false, reason: "The request is not signed." };
  const sent = Number(timestamp);
  if (!Number.isInteger(sent) || Math.abs(nowSeconds - sent) > toleranceSeconds) {
    return { ok: false, reason: "The request is too old or from the future." };
  }
  const expected = Buffer.from(signPayload(secret, timestamp, body), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "The signature does not match." };
  }
  return { ok: true };
}
