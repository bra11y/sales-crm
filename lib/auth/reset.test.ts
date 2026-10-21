import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNewPassword, safeNext } from "./reset.ts";

test("a new password needs 12 characters and must match the confirm box", () => {
  assert.deepEqual(checkNewPassword("", ""), { password: "New password: enter at least 12 characters." });
  assert.deepEqual(checkNewPassword("short", "short"), { password: "New password: use at least 12 characters. You have 5." });
  assert.deepEqual(checkNewPassword("long-enough-pass", "long-enough-pas"), { confirm: "Confirm password: this does not match the new password." });
  assert.deepEqual(checkNewPassword("long-enough-pass", "long-enough-pass"), {});
});

test("after the reset link, only paths inside this app are followed", () => {
  assert.equal(safeNext("/login/new-password"), "/login/new-password");
  assert.equal(safeNext("https://evil.test"), "/");
  assert.equal(safeNext("//evil.test"), "/");
  assert.equal(safeNext("/\\evil.test"), "/");
  assert.equal(safeNext(null), "/");
});
