import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { formatMoney } from "@/lib/crm/money";
import type { SalesPayment } from "@/lib/crm/sales-query";
import { formatDay } from "./status-text";

export default function PaymentsTable({ rows, productNames }: { rows: SalesPayment[]; productNames: Record<string, string> }) {
  return (
    <div role="region" aria-label="Payments table" tabIndex={0} className="focus-visible:ring-ring overflow-x-auto rounded-lg focus-visible:ring-2 focus-visible:outline-none">
      <Table className="min-w-[44em]">
        <caption className="sr-only">Payments, newest first</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={`${p.provider}:${p.reference}`}>
              <TableCell className="tabular-nums">{formatDay(p.paid_at)}</TableCell>
              <TableCell className="font-medium">{p.company_name}</TableCell>
              <TableCell>{productNames[p.product] ?? p.product}</TableCell>
              <TableCell className="tabular-nums">{formatMoney(p.amount_minor, p.currency)}</TableCell>
              <TableCell>{p.status === "succeeded" ? "Paid" : "Failed"}</TableCell>
              <TableCell>
                <code className="caption-style">{p.reference}</code>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
