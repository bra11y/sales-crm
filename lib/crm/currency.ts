export function currencySymbol(currency: string): string {
  const part = new Intl.NumberFormat("en-NG", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? currency;
}

export function formatTotals(items: { value: number; currency: string }[]): string {
  if (items.length === 0) return `${currencySymbol("NGN")}0`;
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.value);
  return [...totals.entries()]
    .sort(([a], [b]) => (a === "NGN" ? -1 : b === "NGN" ? 1 : a.localeCompare(b)))
    .map(([currency, value]) => `${currencySymbol(currency)}${value.toLocaleString("en-NG")}`)
    .join(" · ");
}
