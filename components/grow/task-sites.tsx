import { CHECKED_ON, KIND_LABEL, OPEN_LABEL, type Open, sortedSites } from "@/lib/gigs/tasks";
import { cn } from "@/lib/utils";

const TONE: Record<Open, string> = {
  yes: "bg-(--tag-green-bg) text-(--tag-green-text)",
  check: "bg-(--tag-amber-bg) text-(--tag-amber-text)",
  no: "bg-(--tag-red-bg) text-(--tag-red-text)",
};
const MARK: Record<Open, string> = { yes: "✓", check: "?", no: "✕" };

export default function TaskSites() {
  const sites = sortedSites();
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="tasks-plan" className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] p-5">
        <h2 id="tasks-plan" className="text-[20px] font-semibold tracking-[-0.015em]">
          A plan for money each day
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 leading-normal">
          <li>Apply to two AI training sites today. Their tests take a day or two, but they pay far more than surveys.</li>
          <li>While you wait, fill short surveys in breaks. Expect cents to $2 each: it adds up, but slowly.</li>
          <li>Set up Payoneer once. Most of these sites pay through it, and it sends money to a Nigerian bank.</li>
          <li>Never pay to join, and never share bank logins. A site that asks you for money is a scam.</li>
        </ul>
        <p className="text-soft text-[14px]">Checked on {CHECKED_ON}. Country rules change, so confirm at sign-up.</p>
      </section>

      <section aria-labelledby="tasks-list" className="flex flex-col gap-3">
        <h2 id="tasks-list" className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
          Sites <span className="text-soft font-normal tabular-nums">{sites.length}</span>
        </h2>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sites.map((s) => (
            <li key={s.name} aria-labelledby={`task-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h3 id={`task-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="text-[17px] font-semibold break-words">
                    {s.name}
                  </h3>
                  <p className="text-soft text-[14px]">{KIND_LABEL[s.kind]}</p>
                </div>
                <p className={cn("rounded-md px-2 py-1 text-[13px] font-semibold", TONE[s.open])}>
                  <span aria-hidden="true">{MARK[s.open]} </span>
                  {OPEN_LABEL[s.open]}
                </p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
                <dt className="text-soft">Pay</dt>
                <dd>{s.pay}</dd>
                <dt className="text-soft">Paid by</dt>
                <dd>{s.payout}</dd>
              </dl>
              <p className="text-[14px] leading-normal">{s.note}</p>
              <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 text-[14px]">
                {s.open !== "no" && (
                  <a href={s.url} target="_blank" rel="noopener" className="focus-visible:ring-ring inline-flex min-h-11 items-center rounded font-medium underline underline-offset-2 outline-none focus-visible:ring-2">
                    Sign up at {s.name}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
                <a href={s.source} target="_blank" rel="noopener" className="text-soft focus-visible:ring-ring inline-flex min-h-11 items-center rounded underline underline-offset-2 outline-none focus-visible:ring-2">
                  Where this came from<span className="sr-only">, for {s.name} (opens in a new tab)</span>
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
