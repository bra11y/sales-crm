import { formatMoney } from "@/lib/crm/money";
import type { OverviewFigures } from "@/lib/crm/overview";

export default function Figures({ figures, currency }: { figures: OverviewFigures; currency: string }) {
  const items = [
    { label: "Revenue collected", value: formatMoney(figures.revenueMinor, currency) },
    { label: "Monthly recurring revenue", value: formatMoney(figures.mrrMinor, currency) },
    { label: "New paid accounts", value: String(figures.newPaidAccounts) },
    { label: "Active subscriptions", value: String(figures.activeSubscriptions) },
    { label: "Trials ending in 7 days", value: String(figures.trialsEndingSoon) },
    { label: "Trials ended, not paid", value: String(figures.trialsEnded) },
    { label: "Failed payments", value: String(figures.failedPayments) },
    { label: "Cancellations", value: String(figures.cancellations) },
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="border-foreground/15 flex flex-col gap-1.5 border-t pt-3">
          <dt className="caption-style text-subtle">{item.label}</dt>
          <dd className="text-[1.5em] leading-tight font-medium tracking-[-0.02em] tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
