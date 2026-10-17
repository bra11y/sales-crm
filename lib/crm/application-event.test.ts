import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApplicationEvent } from "./application-event.ts";
import { parseEvent } from "./events.ts";

const now = new Date("2026-10-17T15:00:00.000Z");
const input = {
  company: "Northwind Outfitters",
  role: "Accessibility Consultant",
  manager: "Ada",
  track: "Accessibility",
  contract: true,
  documents: { cv: "# CV", cover: "", proposal: "# Proposal" },
  jd: "Audit our Shopify store",
  matched: ["WCAG 2.2 AA"],
  gaps: ["lottie"],
  value: "3000",
  currency: "USD",
};

test("a filled Apply form becomes a valid application event", () => {
  const built = buildApplicationEvent(input, now);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.event.event_id, "applications:northwind-outfitters:2026-10-17T15:00:00.000Z");
  assert.deepEqual(built.event.data.account, { id: "northwind-outfitters", name: "Northwind Outfitters" });
  assert.equal(built.event.data.segment, "Contract");
  assert.deepEqual(built.event.data.contact, { name: "Ada" });
  assert.deepEqual(Object.keys(built.event.data.application!.documents), ["cv", "proposal"]);
  assert.equal(built.event.data.application!.value_minor, 300_000);
  assert.equal(parseEvent(JSON.stringify(built.event)).ok, true);
});

test("a missing company, role or document is refused with a plain reason", () => {
  assert.deepEqual(buildApplicationEvent({ ...input, company: " " }, now), { ok: false, error: "Add the company or client name first." });
  assert.deepEqual(buildApplicationEvent({ ...input, role: "" }, now), { ok: false, error: "Add the role or project name first." });
  assert.deepEqual(buildApplicationEvent({ ...input, documents: {} }, now), { ok: false, error: "Make at least one document before saving." });
});

test("no value means no pipeline amount, and a job is not a contract", () => {
  const built = buildApplicationEvent({ ...input, value: "", contract: false }, now);
  assert.equal(built.ok && built.event.data.application!.value_minor, undefined);
  assert.equal(built.ok && built.event.data.segment, "Job");
});
