import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The extension's writing check runs the same rules as the CRM. Copy lib/apply/engine.js
// to extension/engine.js after changing it.
test("the extension uses the same writing rules as the CRM", () => {
  assert.equal(readFileSync(new URL("../../extension/engine.js", import.meta.url), "utf8"), readFileSync(new URL("./engine.js", import.meta.url), "utf8"));
});
