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
  // Checked 26 October 2026: "Sign in or create a free account to continue to the employer's application."
  [/(^|\.)jobicy\.com$/, "Jobicy"],
  // Reported 26 October 2026: asks you to sign in before it shows the employer's link.
  [/(^|\.)weworkremotely\.com$/, "We Work Remotely"],
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
