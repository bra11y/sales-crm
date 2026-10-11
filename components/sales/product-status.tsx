import type { SalesProduct } from "@/lib/crm/sales-query";
import { receivingStatus } from "./status-text";

export default function ProductStatus({ products, lastEvent }: { products: SalesProduct[]; lastEvent: Record<string, string> }) {
  const now = new Date();
  const shown = products.filter((p) => p.slug !== "direct");
  return (
    <ul className="flex flex-col">
      {shown.map((p) => {
        const s = receivingStatus(lastEvent[p.slug], now);
        return (
          <li key={p.slug} className="border-foreground/10 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t py-3">
            <span className="font-medium">{p.name}</span>
            <span className="text-subtle">
              <span className="text-foreground">{s.word}.</span> {s.detail}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
