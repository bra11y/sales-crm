import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const [file, baseUrl = "http://localhost:3000"] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/send-event.mjs <event.json> [crm-url]");
  process.exit(1);
}
const body = readFileSync(file, "utf8").trim();
const { product } = JSON.parse(body);
const name = `CRM_SECRET_${product.toUpperCase().replaceAll("-", "_")}`;
const secret = process.env[name];
if (!secret) {
  console.error(`Set ${name} first.`);
  process.exit(1);
}
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
const res = await fetch(`${baseUrl}/api/ingest/${product}`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-crm-timestamp": timestamp, "x-crm-signature": signature },
  body,
});
console.log(res.status, await res.text());
