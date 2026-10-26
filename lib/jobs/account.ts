// Application systems that make you create an account before you can apply.
// Greenhouse, Lever, Ashby, Workable and email applications never do.
const ACCOUNT_FIRST: [RegExp, string][] = [
  [/(^|\.)myworkdayjobs\.com$|(^|\.)workday\.com$/, "Workday"],
  [/(^|\.)taleo\.net$/, "Taleo"],
  [/(^|\.)icims\.com$/, "iCIMS"],
  [/successfactors\.(com|eu)$|(^|\.)sapsf\.(com|eu)$/, "SuccessFactors"],
  [/(^|\.)oraclecloud\.com$/, "Oracle"],
  [/(^|\.)wellfound\.com$|(^|\.)angel\.co$/, "Wellfound"],
  [/(^|\.)glassdoor\.[a-z.]+$/, "Glassdoor"],
  [/(^|\.)indeed\.[a-z.]+$/, "Indeed"],
  [/(^|\.)himalayas\.app$/, "Himalayas"],
  [/(^|\.)ziprecruiter\.com$/, "ZipRecruiter"],
];

// The name of the system when the apply link needs an account first, else null.
export function needsAccount(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ACCOUNT_FIRST.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}
