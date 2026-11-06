import { test } from "node:test";
import assert from "node:assert/strict";
import F from "../apply/facts.js";
import { blankFacts, storeFacts, type Facts } from "./facts.ts";
import { mergeCv, readCv, setupSteps } from "./cv-import.ts";

const blank = storeFacts(blankFacts(F as unknown as Facts));
const CV = `Ada Obi
ada.obi@mail.com | +234 803 000 0000 | Lagos, Nigeria | linkedin.com/in/adaobi
EXPERIENCE
Frontend Developer, Kuda Bank, 2022 - 2024
- Rebuilt the onboarding form in React and cut drop-off by 18%.
- Wrote tests for 40 components.
EDUCATION
BSc Computer Science, University of Lagos, 2017 - 2021
SKILLS: React, TypeScript, Figma
Certificate: Google UX Design Certificate`;

test("a CV is read into the Profile, and anything the CV does not say is dropped", () => {
  const r = readCv(
    {
      person: { name: "Ada Obi", email: "ada.obi@mail.com", phone: "+234 999 999 9999", linkedin: "linkedin.com/in/adaobi" },
      skills: { "Front-end": ["React", "TypeScript", "Vue"], Design: ["Figma"] },
      jobs: [
        { org: "Kuda Bank", title: "Frontend Developer", dates: "2022 - 2024", bullets: ["Rebuilt the onboarding form in React and cut drop-off by 18%.", "Grew revenue by 300%."] },
        { org: "Google", title: "Engineer", dates: "2020", bullets: ["Built search."] },
      ],
      education: { degree: "BSc Computer Science", dates: "2017 - 2021", school: "University of Lagos" },
      certifications: ["Google UX Design Certificate"],
      tracks: { frontend: { profile: "Front-end developer who cut onboarding drop-off by 18% at Kuda Bank.", hook: "An 18% cut in drop-off.", story: "I rebuilt Kuda's onboarding form." }, design: { profile: "Designer with 10 years of work.", hook: "", story: "" } },
    },
    CV,
    Object.keys(blank.tracks),
  );
  assert.ok(r);
  assert.equal(r.person.phone, undefined, "a phone number not in the CV is dropped");
  assert.equal(r.person.linkedin, "https://linkedin.com/in/adaobi");
  assert.deepEqual(r.skills["Front-end"], ["React", "TypeScript"], "Vue is not in the CV");
  assert.deepEqual(r.jobs.map((j) => j.org), ["Kuda Bank"], "Google is not in the CV");
  assert.deepEqual(r.jobs[0].bullets, ["Rebuilt the onboarding form in React and cut drop-off by 18%."], "a made-up 300% is dropped");
  assert.ok(r.tracks.frontend && !r.tracks.design, "a profile with a number the CV never gave is dropped");

  const { facts, added } = mergeCv(blank, r);
  assert.equal(facts.person.name, "Ada Obi");
  assert.equal(facts.jobs.length, 1);
  assert.equal(facts.education.school, "University of Lagos");
  assert.ok(added.includes("1 job") && added.some((a) => a.includes("skills")));
  assert.ok(setupSteps(facts).filter((s) => s.done).length >= 4);
});

test("importing again never overwrites what you wrote, and adds no duplicates", () => {
  const mine = structuredClone(blank);
  mine.person.name = "Ada O. Obi";
  const r = readCv({ person: { name: "Ada Obi" }, skills: { Design: ["Figma"] }, jobs: [{ org: "Kuda Bank", title: "Frontend Developer", dates: "2022 - 2024", bullets: [] }] }, CV, Object.keys(blank.tracks))!;
  const once = mergeCv(mine, r).facts;
  const twice = mergeCv(once, r);
  assert.equal(twice.facts.person.name, "Ada O. Obi");
  assert.equal(twice.facts.jobs.length, 1);
  assert.deepEqual(twice.added, []);
});

test("an imported CV survives the Profile's save rules", async () => {
  const { cleanFacts } = await import("./facts.ts");
  const r = readCv({ person: { name: "Ada Obi", email: "ada.obi@mail.com" }, skills: { Other: ["Figma"], "Front-end": ["React"] }, jobs: [{ org: "Kuda Bank", title: "Frontend Developer", dates: "2022 - 2024", bullets: ["Wrote tests for 40 components."] }], certifications: ["Google UX Design Certificate"], education: { degree: "BSc Computer Science", dates: "2017 - 2021", school: "University of Lagos" } }, CV, Object.keys(blank.tracks))!;
  const saved = cleanFacts(mergeCv(blank, r).facts, blank);
  assert.equal(saved.person.name, "Ada Obi");
  assert.equal(saved.jobs[0].bullets[0].text, "Wrote tests for 40 components.");
  assert.ok(saved.skills.some((g) => g.items.some((i) => i.label === "Figma")), "skills in a new group are kept");
  assert.deepEqual(saved.certifications, ["Google UX Design Certificate"]);
  assert.equal(saved.education.school, "University of Lagos");
});
