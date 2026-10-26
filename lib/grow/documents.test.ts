import { test } from "node:test";
import assert from "node:assert/strict";
import { kindFromName, needsFromText, readiness, safeName } from "./documents.ts";

test("guesses a document's kind from the file names found on this computer", () => {
  assert.equal(kindFromName("Oyenghan Bryan Unofficial Transcript.pdf"), "transcript");
  assert.equal(kindFromName("Bryan_NYSC_certificate .pdf"), "nysc");
  assert.equal(kindFromName("OnyenghanBMayJune24CPACC-Cert.pdf"), "certificate");
  assert.equal(kindFromName("Afreximbank Recommendation Letter Henry Oke.pdf"), "recommendation");
  assert.equal(kindFromName("Bryan_Onyenghan_Accessibility_Engineer_CV.docx"), "cv");
  assert.equal(kindFromName("SLTWTR_Cover_Letter_Bryan_Temple.pdf"), "cover_letter");
  assert.equal(kindFromName("AC_ONYENGHAN_APRIL 2026_FullStmt.pdf"), "proof_of_funds");
  assert.equal(kindFromName("image2birth.jpeg"), "birth_certificate");
});

test("reads which documents a post asks for", () => {
  const t = "Requirements: Academic transcripts, two letters of recommendation, IELTS score, a valid international passport and a statement of purpose.";
  assert.deepEqual(needsFromText(t).sort(), ["language_test", "passport", "personal_statement", "recommendation", "transcript"]);
  assert.deepEqual(needsFromText("Upload a passport photograph"), ["photo"]);
});

test("readiness says what is missing and what expires soon", () => {
  const today = new Date("2026-10-26T00:00:00Z");
  const r = readiness(
    [
      { kind: "cv", expires_on: null },
      { kind: "passport", expires_on: "2027-02-01" },
      { kind: "language_test", expires_on: "2026-01-01" },
    ],
    ["passport", "cv", "transcript", "language_test"],
    today,
  );
  assert.deepEqual(r.have, ["passport", "cv"]);
  assert.deepEqual(r.missing, ["transcript", "language_test"]);
  assert.equal(r.expiring.length, 2);
  assert.equal(safeName("My CV (final) ✓.pdf"), "My-CV-final-.pdf");
});
