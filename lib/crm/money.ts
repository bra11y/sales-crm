export function monthlyMinor(amountMinor: number, intervalMonths: number): number {
  return Math.round(amountMinor / intervalMonths);
}

export function annualisedMinor(amountMinor: number, intervalMonths: number): number {
  return Math.round((amountMinor * 12) / intervalMonths);
}

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(minor / 100);
}
