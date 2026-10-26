// An ATS check for a CV against one job post: the same things applicant tracking
// systems and recruiters' keyword searches look at. Plain rules, no AI, free to run.
// The score is a guide, not a promise: it shows what a parser will and will not find.

export type AtsItem = { id: string; label: string; ok: boolean; detail: string; points: number; max: number };
export type Ats = { score: number; items: AtsItem[]; found: string[]; missing: string[]; notYours: string[] };

// Short capitals that are words, places or job-post noise, not skills.
const NOISE = new Set(
  "A AN AND ARE AS AT BE BY CV DO EU FAQ FOR HR IN IS IT NO OF ON OR OUR PTO THE TO UK US USA WE YOU EEO EOE LLC LTD INC CEO CTO CFO COO VP NB PS ASAP ETC AM PM UTC GMT WAT EST PST CET IST OK II III IV".split(
    " ",
  ),
);

const plain = (s: string) =>
  s
    .replace(/^<!--[\s\S]*?-->/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#`]/g, "")
    .toLowerCase();

const has = (hay: string, term: string) => new RegExp(`(^|[^a-z0-9])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![a-z0-9])`).test(hay);

// Tool and standard names in the post that a keyword search would look for:
// acronyms (WCAG, SEO), dotted names (Next.js), and CamelCase names (TypeScript, GraphQL).
export function postTerms(jd: string): string[] {
  const out = new Set<string>();
  for (const m of jd.matchAll(/\b[A-Z][A-Z0-9]{1,5}\b/g)) if (!NOISE.has(m[0])) out.add(m[0]);
  for (const m of jd.matchAll(/\b[A-Za-z]+\.(?:js|io|ts)\b/gi)) out.add(m[0]);
  for (const m of jd.matchAll(/\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/g)) out.add(m[0]);
  return [...out];
}

export function atsCheck(cv: string, jd: string, o: { role: string; matched: string[]; said?: string[]; gaps: string[] }): Ats {
  const text = plain(cv);
  const lines = cv.split("\n").map((l) => l.trim());
  const items: AtsItem[] = [];
  const add = (id: string, label: string, max: number, ok: boolean, detail: string, part = ok ? 1 : 0) => items.push({ id, label, ok, detail, max, points: Math.round(max * part) });

  // 1. Keywords: the post's own words for skills you have, plus tool names it uses.
  const gaps = o.gaps.map((g) => g.toLowerCase());
  const wanted = [...new Set([...(o.said ?? o.matched), ...postTerms(jd)])].filter((k) => !gaps.includes(k.toLowerCase()));
  const found = wanted.filter((k) => has(text, k));
  const missing = wanted.filter((k) => !has(text, k));
  const share = wanted.length ? found.length / wanted.length : 1;
  add(
    "keywords",
    "Keywords from the post",
    45,
    share >= 0.75,
    wanted.length
      ? `${found.length} of ${wanted.length} found.${missing.length ? ` Missing: ${missing.slice(0, 8).join(", ")}. Add only the ones you really have.` : ""}`
      : "The post names no tools or skills to match.",
    share,
  );

  // 2. The post's job title on the CV: recruiters search by title first.
  const title = o.role
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(senior|sr|junior|jr|lead|principal|staff|remote|hybrid|contract|full[- ]time|part[- ]time)\b\.?/gi, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .toLowerCase();
  const head = plain(lines.slice(0, 6).join(" "));
  const words = title.split(/\s+/).filter((w) => w.length > 2);
  const titleShare = words.length ? words.filter((w) => head.includes(w)).length / words.length : 1;
  add(
    "title",
    "Job title near the top",
    10,
    titleShare >= 0.6,
    titleShare >= 0.6 ? "Your headline uses the post's job title." : `Your headline does not say "${title}". Use the post's title if it is true for you.`,
    titleShare,
  );

  // 3. Section names parsers know.
  const heads = lines.filter((l) => /^##\s/.test(l)).map((l) => l.toLowerCase());
  const need = [
    ["experience", /experience|employment|work history/],
    ["education", /education/],
    ["skills", /skills/],
  ] as const;
  const lacking = need.filter(([, re]) => !heads.some((h) => re.test(h))).map(([n]) => n);
  add(
    "sections",
    "Standard section names",
    10,
    !lacking.length,
    lacking.length ? `Add a section named ${lacking.join(", ")}.` : "Experience, Education and Skills are all named the usual way.",
    1 - lacking.length / need.length,
  );

  // 4. Contact details as plain text, near the top.
  const top = lines.slice(0, 8).join(" ");
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/.test(top);
  const phone = /\+?\d[\d\s().-]{7,}\d/.test(top);
  add(
    "contact",
    "Email and phone at the top",
    10,
    email && phone,
    email && phone ? "Both are plain text a parser can read." : `Add your ${[!email && "email", !phone && "phone number"].filter(Boolean).join(" and ")} at the top.`,
    (Number(email) + Number(phone)) / 2,
  );

  // 5. Dates on every role.
  const roles = lines.filter((l) => /^###\s/.test(l));
  const dated = roles.filter((l) => /\b(19|20)\d{2}\b|present/i.test(l));
  add(
    "dates",
    "Dates on every role",
    5,
    dated.length === roles.length,
    roles.length ? `${dated.length} of ${roles.length} roles have dates.` : "No roles found.",
    roles.length ? dated.length / roles.length : 0,
  );

  // 6. One column of real text: no tables or pictures a parser would skip.
  const table = lines.some((l) => /^\|.*\|$/.test(l));
  const image = /!\[[^\]]*\]\(/.test(cv);
  add("layout", "One column, no tables or images", 5, !table && !image, table || image ? "Tables and images get skipped or scrambled by parsers. Use plain lines." : "Simple one-column text.");

  // 7. Measured results: numbers are what recruiters skim for.
  const bullets = lines.filter((l) => /^- /.test(l) && !/^- \*\*/.test(l));
  const measured = bullets.filter((l) => /\d/.test(l));
  const mShare = bullets.length ? measured.length / bullets.length : 0;
  add(
    "results",
    "Results with numbers",
    10,
    mShare >= 0.5,
    `${measured.length} of ${bullets.length} bullets have a number.${mShare < 0.5 ? " Add time saved, %, users or money where it is true." : ""}`,
    Math.min(1, mShare / 0.5),
  );

  // 8. Length: one to two pages.
  const count = text.split(/\s+/).filter(Boolean).length;
  const okLen = count >= 350 && count <= 1100;
  add("length", "One to two pages", 5, okLen, `${count} words.${count > 1100 ? " Cut older or less relevant bullets." : count < 350 ? " Add more detail on your recent work." : ""}`);

  const notYours = o.gaps;
  const score = items.reduce((n, i) => n + i.points, 0);
  return { score, items, found, missing, notYours };
}
