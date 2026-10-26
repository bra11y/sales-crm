import { test } from "node:test";
import assert from "node:assert/strict";
import F from "../apply/facts.js";
import { applicationSteps, draftStatement } from "./statement.ts";

const info = { name: "Chevening Scholarship", place: "UK", level: "Master's", deadline: "2026-11-04", url: "https://www.chevening.org/apply", needs: ["recommendation" as const] };

test("the statement draft uses only real facts and leaves the rest in brackets", () => {
  const s = draftStatement(F as never, info);
  assert.match(s, /Crawford University/);
  assert.match(s, /Chevening Scholarship/);
  assert.ok((s.match(/\[[^\]]+\]/g) ?? []).length >= 4);
});

test("listing titles become the programme's name, and levels read as words", () => {
  const s = draftStatement(F as never, { ...info, name: "2027 Gates Cambridge Scholarship in UK | Fully Funded", level: "masters" });
  assert.match(s, /applying for the Gates Cambridge Scholarship in UK because/);
  assert.match(s, /A master's place in the UK/);
});

test("application steps tick the documents you already have", () => {
  const steps = applicationSteps(info, ["cv"]);
  assert.ok(steps.find((s) => s.text.startsWith("CV"))?.done);
  assert.ok(steps.some((s) => /Upload your international passport/i.test(s.text) && !s.done));
  assert.ok(steps.some((s) => /referees/.test(s.text)));
  assert.match(steps.at(-1)!.text, /before 2026-11-04/);
});
