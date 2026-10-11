import { currenciesIn, type PaymentRow, type SubscriptionRow } from "./overview";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export function pickFilters(
  params: Record<string, string | string[] | undefined>,
  data: { subscriptions: SubscriptionRow[]; payments: PaymentRow[]; products: { slug: string; name: string }[] },
) {
  const found = currenciesIn(data.subscriptions, data.payments);
  const currencies = found.length ? found : ["NGN"];
  const wanted = one(params.currency);
  const currency = wanted && currencies.includes(wanted) ? wanted : currencies[0];
  const p = one(params.product);
  const product = data.products.some((x) => x.slug === p) ? p : undefined;
  const productNames = Object.fromEntries(data.products.map((x) => [x.slug, x.name]));
  return { currency, currencies, product, productNames, status: one(params.status) ?? "" };
}
