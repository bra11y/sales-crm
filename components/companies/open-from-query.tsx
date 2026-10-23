"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCompaniesStore } from "@/stores/companies-store";

// Links like /?company=<id> (from the board, activity, contacts) open that company's panel.
export default function OpenFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useCompaniesStore((s) => s.hydrated);
  const detailOpen = useCompaniesStore((s) => s.detailOpen);
  const opened = useRef<string | null>(null);
  const shown = useRef(false);
  const id = params.get("company");

  useEffect(() => {
    if (!hydrated || !id || opened.current === id) return;
    const { companies, openDetail } = useCompaniesStore.getState();
    if (!companies.some((c) => c.id === id)) return;
    opened.current = id;
    openDetail(id);
  }, [hydrated, id]);

  // Closing the panel drops the id from the address, so Back and reload behave.
  useEffect(() => {
    if (detailOpen && opened.current) shown.current = true;
    if (!detailOpen && shown.current && opened.current && id === opened.current) {
      opened.current = null;
      shown.current = false;
      router.replace(pathname, { scroll: false });
    }
  }, [detailOpen, id, pathname, router]);

  return null;
}
