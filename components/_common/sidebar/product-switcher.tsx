"use client";

import { ALL_PRODUCTS } from "@/lib/companies";
import { useCompaniesStore } from "@/stores/companies-store";

export default function ProductSwitcher() {
  const products = useCompaniesStore((s) => s.products);
  const product = useCompaniesStore((s) => s.product);
  const setProduct = useCompaniesStore((s) => s.setProduct);

  return (
    <div className="border-sidebar-border flex flex-col gap-1.5 border-b px-3 py-3">
      <label htmlFor="product-switcher" className="caption-style text-subtle">
        Product
      </label>
      <select
        id="product-switcher"
        value={product}
        onChange={(e) => setProduct(e.target.value)}
        className="border-sidebar-border bg-sidebar text-sidebar-foreground focus-visible:ring-ring h-9 rounded-lg border px-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        <option value={ALL_PRODUCTS}>All products</option>
        {products.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
