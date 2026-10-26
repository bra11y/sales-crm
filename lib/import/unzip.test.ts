import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { readZipText } from "./unzip.ts";

// Builds a small zip by hand: one photo stored as-is, then _chat.txt compressed.
function zip(files: { name: string; data: Buffer; deflate: boolean }[]): ArrayBuffer {
  const parts: Buffer[] = [];
  const dir: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const body = f.deflate ? deflateRawSync(f.data) : f.data;
    const name = Buffer.from(f.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(f.deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(f.deflate ? 8 : 0, 10);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(f.data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    parts.push(local, name, body);
    dir.push(head, name);
    offset += 30 + name.length + body.length;
  }
  const d = Buffer.concat(dir);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(d.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, d, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

test("finds _chat.txt inside a WhatsApp zip and inflates it", async () => {
  const chat = "[10/26/26, 08:33:07] ~ A: *Hello* ".repeat(200);
  const z = zip([
    { name: "00000011-PHOTO.jpg", data: Buffer.from([1, 2, 3, 4]), deflate: false },
    { name: "_chat.txt", data: Buffer.from(chat), deflate: true },
  ]);
  assert.equal(await readZipText(z, (n) => n.endsWith("_chat.txt")), chat);
  assert.equal(await readZipText(z, (n) => n === "missing.txt"), null);
  assert.equal(await readZipText(new ArrayBuffer(10), () => true), null);
});
