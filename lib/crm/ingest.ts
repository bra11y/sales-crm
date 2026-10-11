import type { CrmDb } from "./apply.ts";
import { applyEvent } from "./apply.ts";
import { parseEvent } from "./events.ts";
import { verifySignature } from "./signature.ts";

export type IngestInput = {
  product: string;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  nowSeconds: number;
  secret: string | undefined;
  db: CrmDb;
};

const MAX_BYTES = 64 * 1024;

export async function handleIngest(input: IngestInput): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!/^[a-z0-9-]{1,40}$/.test(input.product) || !input.secret) {
    return { status: 404, body: { error: "Unknown product." } };
  }
  if (Buffer.byteLength(input.rawBody) > MAX_BYTES) {
    return { status: 413, body: { error: "The event is larger than 64 KB." } };
  }
  const check = verifySignature({
    secret: input.secret,
    timestamp: input.timestamp,
    signature: input.signature,
    body: input.rawBody,
    nowSeconds: input.nowSeconds,
  });
  if (!check.ok) return { status: 401, body: { error: check.reason } };

  const parsed = parseEvent(input.rawBody);
  if (!parsed.ok) return { status: 400, body: { error: parsed.reason } };
  if (parsed.event.product !== input.product) {
    return { status: 400, body: { error: "The event's product does not match the address it was sent to." } };
  }

  const result = await applyEvent(parsed.event, input.db);
  if (result.status === "unsupported") return { status: 404, body: { error: "No adapter for this product." } };
  return { status: 200, body: { ...result } };
}
