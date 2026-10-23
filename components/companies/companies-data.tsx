"use client";

import { useEffect } from "react";
import type { Company, Owner, ProductProfile } from "@/data/companies";
import type { Notification } from "@/data/notifications";
import { useCompaniesStore } from "@/stores/companies-store";

type Props = {
  companies: Company[];
  products: ProductProfile[];
  owners: Owner[];
  currentUser: Owner;
  notifications?: Notification[];
  children: React.ReactNode;
};

export default function CompaniesData({ children, companies, products, owners, currentUser, notifications }: Props) {
  useEffect(() => {
    useCompaniesStore.getState().hydrate({ companies, products, owners, currentUser, notifications });
  }, [companies, products, owners, currentUser, notifications]);
  return <>{children}</>;
}
