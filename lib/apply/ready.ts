// The checks shown before you apply, so every application goes out strong.
// "no" blocks a good application, "warn" is worth a look, "yes" is ready.

export type Check = { state: "yes" | "warn" | "no"; text: string; fix?: { href: string; label: string } };

type Job = { eligibility: string; hidden_reason: string | null; pay_monthly_usd: number | null; posted_at: string | null; matched: string[]; gaps: string[] };
type Ready = {
  person: Record<"name" | "email" | "phone" | "linkedin" | "portfolio" | "location", string>;
  proof: unknown[];
  problems: string[];
  byEmail: boolean;
  mail: { email: string | null; tested: boolean };
  extension: boolean;
  minMonthlyUsd: number;
};

const DAY = 86_400_000;
const usd = (n: number) => "$" + n.toLocaleString("en-US");

export function readyChecks(job: Job, r: Ready, now = Date.now()): Check[] {
  const out: Check[] = [];

  if (job.eligibility === "restricted") out.push({ state: "no", text: job.hidden_reason ? `${job.hidden_reason}.` : "The post is not open to where you live." });
  else if (job.eligibility === "unknown") out.push({ state: "warn", text: "The post does not say where you can work from. Check before you apply." });
  else out.push({ state: "yes", text: "You can apply from where you live." });

  if (job.pay_monthly_usd === null) out.push({ state: "warn", text: "Pay is not listed. Ask about it in your first reply." });
  else if (job.pay_monthly_usd < r.minMonthlyUsd) out.push({ state: "no", text: `Pays about ${usd(job.pay_monthly_usd)} a month, under your ${usd(r.minMonthlyUsd)} floor.` });
  else out.push({ state: "yes", text: `Pays about ${usd(job.pay_monthly_usd)} a month.` });

  const days = job.posted_at ? Math.floor((now - Date.parse(job.posted_at)) / DAY) : null;
  if (days !== null && days > 30) out.push({ state: "warn", text: `Posted ${days} days ago. It may be filled, so apply today or skip it.` });
  else if (days !== null && days <= 7) out.push({ state: "yes", text: "Posted this week, so you are early." });

  const n = job.matched.length;
  if (n >= 4) out.push({ state: "yes", text: `Your CV leads with the ${n} skills it asks for.` });
  else if (n > 0) out.push({ state: "warn", text: `Only ${n} of your skills match. Add any you have to Profile so the CV can show them.`, fix: { href: "/profile#skills", label: "Add skills" } });
  else out.push({ state: "warn", text: "No skills matched yet. Read the post: if it fits, add its tools to Profile.", fix: { href: "/profile#skills", label: "Add skills" } });

  const missing = (["phone", "linkedin", "portfolio"] as const).filter((k) => !r.person[k]);
  if (missing.length) out.push({ state: "no", text: `Forms will ask for your ${missing.join(", ")}. Add ${missing.length === 1 ? "it" : "them"} once.`, fix: { href: "/profile", label: "Open Profile" } });
  else out.push({ state: "yes", text: "Name, email, phone, LinkedIn and portfolio are ready to fill in." });

  if (r.proof.length) out.push({ state: "yes", text: `${r.proof.length} piece${r.proof.length === 1 ? "" : "s"} of proof picked for this job.` });
  else out.push({ state: "warn", text: "No proof of work picked. One linked project lifts replies a lot.", fix: { href: "/profile#proof", label: "Add proof" } });

  if (r.byEmail) {
    if (!r.mail.email) out.push({ state: "no", text: "Gmail is not connected, so the email can't go from your address.", fix: { href: "/profile#gmail", label: "Connect Gmail" } });
    else if (!r.mail.tested) out.push({ state: "warn", text: "Send yourself the test email once, to see what employers get.", fix: { href: "/profile#gmail", label: "Send the test" } });
    else out.push({ state: "yes", text: `Sends from ${r.mail.email}.` });
  } else if (!r.extension) out.push({ state: "warn", text: "The Chrome extension is not on. With it, the form fills itself.", fix: { href: "/profile#extension", label: "Set it up" } });
  else out.push({ state: "yes", text: "The extension is on and will fill the form." });

  for (const p of r.problems) out.push({ state: "no", text: p });
  return out;
}

export function readySummary(checks: Check[]): string {
  const no = checks.filter((c) => c.state === "no").length;
  const warn = checks.filter((c) => c.state === "warn").length;
  if (no) return `${no} thing${no === 1 ? "" : "s"} to fix first`;
  if (warn) return `Ready, with ${warn} thing${warn === 1 ? "" : "s"} to check`;
  return "Ready to apply";
}
