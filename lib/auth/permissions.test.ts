import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, asRole, homeFor, permissionFor } from "./permissions.ts";

test("each role opens only its own pages, and unknown pages are denied", () => {
  assert.ok(allowed("owner", "/payments"));
  assert.ok(allowed("member", "/deals"));
  assert.ok(!allowed("member", "/payments"));
  assert.ok(!allowed("member", "/team"));
  assert.ok(allowed("seeker", "/jobs/add"));
  assert.ok(allowed("seeker", "/scholarships"));
  assert.ok(allowed("seeker", "/documents"));
  assert.ok(!allowed("seeker", "/"), "Companies is the sales CRM");
  assert.ok(!allowed("seeker", "/deals"));
  assert.ok(!allowed("seeker", "/overview"));
  assert.ok(allowed("seeker", "/help"));
  assert.equal(permissionFor("/something-new"), "team:manage");
  assert.ok(!allowed("member", "/something-new"));
  assert.equal(permissionFor("/applications/x"), "jobs:use");
});

test("seekers land on Jobs, the CRM roles on Companies; bad values become seekers", () => {
  assert.equal(homeFor("seeker"), "/jobs");
  assert.equal(homeFor("member"), "/");
  assert.equal(asRole("admin"), "seeker");
  assert.equal(asRole("owner"), "owner");
});
