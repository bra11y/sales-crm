// Locks the Gmail app password with AES-256-GCM before it is stored.
// The key lives only in the server env (MAIL_ENCRYPTION_KEY, 32 bytes, base64).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type Sealed = { ciphertext: string; iv: string; tag: string };

export function readKey(value = process.env.MAIL_ENCRYPTION_KEY): Buffer | null {
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  return key.length === 32 ? key : null;
}

export function seal(secret: string, key: Buffer): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function open(sealed: Sealed, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
