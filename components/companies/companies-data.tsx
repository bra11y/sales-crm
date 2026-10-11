"use client";

import { useEffect } from "react";
import type { Company, Owner, ProductProfile } from "@/data/companies";
import { useCompaniesStore } from "@/stores/companies-store";

type Props = {
  companies: Company[];
  products: ProductProfile[];
  owners: Owner[];
  currentUser: Owner;
  children: React.ReactNode;
};

export default function CompaniesData({ children, companies, products, owners, currentUser }: Props) {
  useEffect(() => {
    useCompaniesStore.getState().hydrate({ companies, products, owners, currentUser });
  }, [companies, products, owners, currentUser]);
  return <>{children}</>;
}
