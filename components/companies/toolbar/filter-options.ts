import { useMemo } from "react";
import { ACTIVITY_WINDOWS, SORT_OPTIONS } from "@/data/companies";
import { ALL_OWNERS, ALL_PRODUCTS, ANY_STAGE } from "@/lib/companies";
import { useCompaniesStore } from "@/stores/companies-store";

export function useOwnerOptions() {
  const owners = useCompaniesStore((s) => s.owners);
  return useMemo(
    () => [{ value: ALL_OWNERS, label: "All Owners" }, ...owners.map((o) => ({ value: o.name, label: o.name }))],
    [owners],
  );
}

export function useStageOptions() {
  const products = useCompaniesStore((s) => s.products);
  const product = useCompaniesStore((s) => s.product);
  return useMemo(() => {
    const chosen = product === ALL_PRODUCTS ? products : products.filter((p) => p.slug === product);
    const tags = Array.from(new Set(chosen.flatMap((p) => [...p.segments, ...p.stages])));
    return [{ value: ANY_STAGE, label: "Any" }, ...tags.map((tag) => ({ value: tag, label: tag }))];
  }, [products, product]);
}

export const ACTIVITY_OPTIONS = ACTIVITY_WINDOWS.map((days) => ({
  value: String(days),
  label: `${days} Days`,
}));

export const SORT_MENU_OPTIONS = SORT_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));
