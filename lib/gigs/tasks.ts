// Small paid tasks: surveys and AI training work, checked for people living in Nigeria.
// Researched on 27 November 2026. Country rules change, so each site is confirmed at sign-up.

export type TaskKind = "ai" | "survey" | "micro";
export type Open = "yes" | "check" | "no";
export type TaskSite = { name: string; url: string; kind: TaskKind; pay: string; payout: string; open: Open; note: string; source: string };

export const CHECKED_ON = "27 November 2026";

export const TASK_SITES: TaskSite[] = [
  {
    name: "Mindrift",
    url: "https://mindrift.ai",
    kind: "ai",
    pay: "Per task or hour, after a test",
    payout: "Payoneer or Tipalti, twice a month",
    open: "yes",
    note: "Toloka's AI training work. Nigeria is not on its blocked list. Your tech and writing skills fit its coding and writing projects.",
    source: "https://www.raenest.com/blog/4-outlier-alternatives-for-nigerians-and-how-to-get-paid",
  },
  {
    name: "Mercor",
    url: "https://mercor.com",
    kind: "ai",
    pay: "Hourly, on expert projects",
    payout: "Stripe to a Nigerian bank, weekly",
    open: "yes",
    note: "Projects for people with real skills, like coding and accessibility. Real emails come only from @mercor.com.",
    source: "https://www.raenest.com/blog/4-outlier-alternatives-for-nigerians-and-how-to-get-paid",
  },
  {
    name: "Welocalize AI trainers",
    url: "https://jobs.lever.co/weloglobal",
    kind: "ai",
    pay: "Hourly; one listing showed $10 to $16",
    payout: "Set in the contract",
    open: "yes",
    note: "Hires speakers of Yoruba, Igbo and Hausa to train AI. Look for the Talent Hub roles for your language.",
    source: "https://jobs.lever.co/weloglobal/33820f32-510e-4dde-9488-bc7f47ad4b3c",
  },
  {
    name: "Corpshore",
    url: "https://platform.corpshore.ai/nigeria",
    kind: "ai",
    pay: "Per task",
    payout: "Shown at sign-up",
    open: "yes",
    note: "AI data work with contributors in Lagos, Kano and Ibadan.",
    source: "https://platform.corpshore.ai/nigeria",
  },
  {
    name: "Clickworker",
    url: "https://www.clickworker.com",
    kind: "micro",
    pay: "Cents to a few euros per task",
    payout: "Payoneer, weekly from €10",
    open: "check",
    note: "Short tasks like tagging photos and checking text. Confirm Nigeria at sign-up.",
    source: "https://www.lilachbullock.com/online-jobs-nigeria-pay-weekly/",
  },
  {
    name: "ySense",
    url: "https://www.ysense.com",
    kind: "survey",
    pay: "Cents to $2 per survey",
    payout: "Payoneer or Skrill, from about $10",
    open: "check",
    note: "The survey site Nigerian guides name most. The first cash-out can take up to 15 working days.",
    source: "https://help.ysense.com/hc/en-us/articles/360031029812-When-and-how-will-I-get-paid-Cashout",
  },
  {
    name: "OpinionPadi",
    url: "https://www.opinionpadi.com",
    kind: "survey",
    pay: "Small amounts per survey",
    payout: "Guides disagree: bank in naira, or PayPal and gift cards",
    open: "check",
    note: "Built for Nigeria. Check the payout options before you spend time on it.",
    source: "https://www.infolandia.com.ng/10-legit-survey-sites-that-pay-nigerians-in-2026-new-updated-list/",
  },
  {
    name: "Prolific",
    url: "https://www.prolific.com",
    kind: "survey",
    pay: "Fixed pay per study",
    payout: "PayPal",
    open: "no",
    note: "Nigeria is not on its country list. You can join the waitlist, but it may never open.",
    source: "https://participant-help.prolific.com/en/articles/445007-who-can-participate-in-studies-on-prolific",
  },
  {
    name: "Outlier",
    url: "https://outlier.ai",
    kind: "ai",
    pay: "Hourly",
    payout: "PayPal or AirTM",
    open: "no",
    note: "Nigeria is not on its country list and it rejects Nigerian phone numbers. Using a VPN breaks its rules and gets accounts closed.",
    source: "https://techsoma.africa/nigerias-ai-training-workers-are-being-locked-out-of-the-global-gig-economy/",
  },
];

export const KIND_LABEL: Record<TaskKind, string> = { ai: "AI training", survey: "Surveys", micro: "Short tasks" };
export const OPEN_LABEL: Record<Open, string> = { yes: "Open to Nigeria", check: "Check at sign-up", no: "Not open to Nigeria" };

// Open sites first, then the ones to confirm; AI work before surveys, since it pays far more.
export function sortedSites(sites = TASK_SITES): TaskSite[] {
  const o: Record<Open, number> = { yes: 0, check: 1, no: 2 };
  const k: Record<TaskKind, number> = { ai: 0, micro: 1, survey: 2 };
  return [...sites].sort((a, b) => o[a.open] - o[b.open] || k[a.kind] - k[b.kind]);
}
