import Button from "@/components/_ui/button";
import { PERIOD_OPTIONS } from "@/lib/crm/sales-query";

type Option = { value: string; label: string };

type Props = {
  period?: string;
  product: string;
  currency: string;
  products: { slug: string; name: string }[];
  currencies: string[];
  statusOptions?: Option[];
  status?: string;
};

const field = "flex min-w-[9em] flex-col gap-1.5";
const control =
  "h-9 rounded-lg border border-border bg-background px-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export default function PeriodForm({ period, product, currency, products, currencies, statusOptions, status }: Props) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter">
      {period !== undefined && (
        <div className={field}>
          <label htmlFor="period" className="caption-style text-subtle">
            Period
          </label>
          <select id="period" name="period" defaultValue={period} className={control}>
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={field}>
        <label htmlFor="product" className="caption-style text-subtle">
          Product
        </label>
        <select id="product" name="product" defaultValue={product} className={control}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className={field}>
        <label htmlFor="currency" className="caption-style text-subtle">
          Currency
        </label>
        <select id="currency" name="currency" defaultValue={currency} className={control}>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {statusOptions && (
        <div className={field}>
          <label htmlFor="status" className="caption-style text-subtle">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className={control}>
            <option value="">Any status</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button type="submit" variant="secondary" size="md" className="h-9">
        Apply
      </Button>
    </form>
  );
}
