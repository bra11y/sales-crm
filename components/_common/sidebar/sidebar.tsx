"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/_ui/sheet";
import SidebarContent, { type SidebarData } from "./sidebar-content";
import SidebarResizer from "./sidebar-resizer";
import { useCompaniesStore } from "@/stores/companies-store";

export default function Sidebar({ data }: { data: SidebarData }) {
  const sidebarOpen = useCompaniesStore((state) => state.sidebarOpen);
  const setSidebarOpen = useCompaniesStore((state) => state.setSidebarOpen);

  return (
    <>
      <aside className="border-sidebar-border bg-sidebar relative hidden w-(--sidebar-width) shrink-0 border-r lg:flex lg:flex-col">
        <SidebarContent data={data} />
        <SidebarResizer />
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="border-sidebar-border bg-sidebar w-[254px] max-w-[85vw]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Sales CRM sections and pipelines</SheetDescription>
          <SidebarContent data={data} />
        </SheetContent>
      </Sheet>
    </>
  );
}
