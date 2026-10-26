// Your documents for applications, and which ones a school, scholarship or job asks for.

export const DOC_KINDS = [
  "cv",
  "cover_letter",
  "transcript",
  "degree",
  "school_result",
  "nysc",
  "certificate",
  "passport",
  "national_id",
  "lga_certificate",
  "birth_certificate",
  "recommendation",
  "personal_statement",
  "language_test",
  "photo",
  "admission",
  "proof_of_funds",
  "other",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_LABEL: Record<DocKind, string> = {
  cv: "CV or résumé",
  cover_letter: "Cover letter",
  transcript: "Transcript",
  degree: "Degree certificate",
  school_result: "WAEC, NECO or school result",
  nysc: "NYSC certificate",
  certificate: "Professional certificate",
  passport: "International passport",
  national_id: "National ID (NIN)",
  lga_certificate: "Local government ID (certificate of origin)",
  birth_certificate: "Birth certificate",
  recommendation: "Recommendation letter",
  personal_statement: "Personal statement or essay",
  language_test: "English test (IELTS, TOEFL, Duolingo)",
  photo: "Passport photograph",
  admission: "Admission letter",
  proof_of_funds: "Proof of funds or bank statement",
  other: "Other",
};

export type Doc = { id: string; kind: DocKind; title: string; path: string; mime: string; size_bytes: number; expires_on: string | null; note: string | null; created_at: string };

// What most scholarship and school applications ask for, in the order you usually need them.
export const SCHOLARSHIP_NEEDS: DocKind[] = ["passport", "transcript", "degree", "cv", "recommendation", "personal_statement"];
export const JOB_NEEDS: DocKind[] = ["cv", "cover_letter", "national_id", "photo"];

// Words in a post that name a document.
const WORDS: [DocKind, RegExp][] = [
  ["transcript", /\btranscripts?\b|academic records?/i],
  ["degree", /\b(degree|bachelor'?s|first degree)\s+(certificate|result)|\bcertificate of (graduation|degree)\b/i],
  ["school_result", /\b(waec|neco|o'?\s?level|ssce|wassce)\b/i],
  ["passport", /\b(international )?passport\b(?!\s*photo)/i],
  ["national_id", /\b(nin|national id(entity)?|national identification)\b/i],
  ["recommendation", /\b(recommendation|reference) letters?|letters? of (recommendation|reference)|referees?\b/i],
  ["personal_statement", /\b(personal statement|statement of purpose|motivation letter|essay|sop)\b/i],
  ["language_test", /\b(ielts|toefl|duolingo|pte|english proficiency)\b/i],
  ["cv", /\b(cv|curriculum vitae|resume|résumé)\b/i],
  ["photo", /\bpassport (photo|photograph)s?\b/i],
  ["admission", /\b(admission|offer) letter\b/i],
  ["nysc", /\bnysc\b/i],
  ["birth_certificate", /\bbirth certificate\b|\bage declaration\b/i],
  ["lga_certificate", /\b(local government (id|identification|certificate)|lga (certificate|identification|id)|certificate of (state of )?origin|state of origin certificate|certificate of indigen)/i],
  ["proof_of_funds", /\b(proof of funds|bank statement)\b/i],
];

export function needsFromText(text: string): DocKind[] {
  return WORDS.filter(([, re]) => re.test(text)).map(([k]) => k);
}

// Guesses a document's kind from its file name, so a dropped file starts in the right place.
export function kindFromName(name: string): DocKind {
  const n = name.toLowerCase();
  if (/cover.?letter/.test(n)) return "cover_letter";
  if (/\b(cv|resume|résumé)\b|_cv|cv_|-cv/.test(n)) return "cv";
  if (/transcript/.test(n)) return "transcript";
  if (/nysc/.test(n)) return "nysc";
  if (/waec|neco|ssce/.test(n)) return "school_result";
  if (/passport.?(photo|pic)|headshot/.test(n)) return "photo";
  if (/passport/.test(n)) return "passport";
  if (/\bnin\b|national.?id|nimc/.test(n)) return "national_id";
  if (/\blga\b|local.?gov|state.?of.?origin|certificate.?of.?origin|indigene|origin/.test(n)) return "lga_certificate";
  if (/birth/.test(n)) return "birth_certificate";
  if (/recommend|reference/.test(n)) return "recommendation";
  if (/statement.?of.?purpose|personal.?statement|\bsop\b|essay|motivation/.test(n)) return "personal_statement";
  if (/ielts|toefl|duolingo/.test(n)) return "language_test";
  if (/admission|offer.?letter/.test(n)) return "admission";
  if (/bank.?statement|stmt|proof.?of.?fund/.test(n)) return "proof_of_funds";
  if (/degree|diploma|b\.?sc|bachelor/.test(n)) return "degree";
  if (/cert/.test(n)) return "certificate";
  return "other";
}

export type Readiness = { have: DocKind[]; missing: DocKind[]; expiring: Doc[] };

// Which of the needed documents you have, which are missing, and which expire within 6 months.
export function readiness(docs: Pick<Doc, "kind" | "expires_on">[], needs: DocKind[], today = new Date()): Readiness {
  const soon = new Date(today.getTime() + 183 * 86_400_000).toISOString().slice(0, 10);
  const now = today.toISOString().slice(0, 10);
  const valid = docs.filter((d) => !d.expires_on || d.expires_on >= now);
  const kinds = new Set(valid.map((d) => d.kind));
  const uniqueNeeds = [...new Set(needs)];
  return {
    have: uniqueNeeds.filter((k) => kinds.has(k)),
    missing: uniqueNeeds.filter((k) => !kinds.has(k)),
    expiring: docs.filter((d) => d.expires_on && d.expires_on <= soon) as Doc[],
  };
}

export const MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
// A safe file name for storage: letters, numbers, dots and dashes only.
export const safeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-120) || "file";
