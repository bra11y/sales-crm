import { test } from "node:test";
import assert from "node:assert/strict";
import { coachPrompt, dropInvented, readCoached, TOOLS } from "./coach.ts";

test("the coach's answer is read into sections, and an out-of-range score is ignored", () => {
  const c = readCoached({ score: 72, sections: [{ title: "Why I would call you", items: ["You hold CPACC.", ""] }, { title: "", items: ["x"] }] });
  assert.deepEqual(c, { score: 72, sections: [{ title: "Why I would call you", items: ["You hold CPACC."] }] });
  assert.equal(readCoached({ score: 900, sections: [{ title: "A", items: ["b"] }] })?.score, undefined);
  assert.equal(readCoached({ sections: [] }), null);
});

test("a line with a number the Profile never gave is dropped", () => {
  const c = { sections: [{ title: "Changes", items: ["Say you audited 40 pages.", "Say you cut drop-off by 35%.", "Add your CPACC to the top."] }] };
  const { coached, dropped } = dropInvented(c, "Audited 40 pages for Bihub. CPACC.");
  assert.equal(dropped, 1);
  assert.deepEqual(coached.sections[0].items, ["Say you audited 40 pages.", "Add your CPACC to the top."]);
});

test("every tool has a prompt that forbids invented experience", () => {
  for (const t of [...TOOLS.map((x) => x.id), "feedback" as const]) {
    const p = coachPrompt(t, { profile: "P", job: "J", role: "R", question: "Q", answer: "A" });
    assert.match(p.system, /Never invent/, t);
    assert.match(p.system, /JSON only/, t);
  }
});

test("a suggested line claiming a certificate the Profile lacks is dropped unless asked", async () => {
  const { dropUnaskedClaims } = await import("./coach.ts");
  const c = { sections: [{ title: "5 changes", items: ['Add in Certifications: "Web Accessibility Specialist (WAS), completed July 2024"', "Only if true: have you trained developers? Then add who and when.", 'Move "CPACC certification" to the top.'] }] };
  const { coached, dropped } = dropUnaskedClaims(c, "CPACC certification, IAAP, 2024. WAS in progress.");
  assert.equal(dropped, 1);
  assert.equal(coached.sections[0].items.length, 2);
});
