import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { formatMoney } from "@/lib/crm/money";
import { effectiveStatus } from "@/lib/crm/overview";
import type { SalesSubscription } from "@/lib/crm/sales-query";
import { formatDay } from "./status-text";

const PER: Record<number, string> = { 1: "month", 3: "quarter", 6: "6 months", 12: "year" };

export default function SubscriptionsTable({ rows, productNames }: { rows: SalesSubscription[]; productNames: Record<string, string> }) {
  const now = new Date();
  return (
    <div role="region" aria-label="Subscriptions table" tabIndex={0} className="focus-visible:ring-ring overflow-x-auto rounded-lg focus-visible:ring-2 focus-visible:outline-none">
      <Table className="min-w-[44em]">
        <caption className="sr-only">Subscriptions, one row per company and product</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Renews or ends</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={`${s.company_id}:${s.product}`}>
              <TableCell className="font-medium">{s.company_name}</TableCell>
              <TableCell>{productNames[s.product] ?? s.product}</TableCell>
              <TableCell>{s.plan}</TableCell>
              <TableCell>{effectiveStatus(s, now)}</TableCell>
              <TableCell className="tabular-nums">
                {formatMoney(s.amount_minor, s.currency)} / {PER[s.interval_months] ?? `${s.interval_months} months`}
              </TableCell>
              <TableCell className="tabular-nums">{formatDay(s.cancelled_at ?? s.renews_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
