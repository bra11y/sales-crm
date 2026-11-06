"use client";

import { usePathname } from "next/navigation";
import Button from "@/components/_ui/button";
import { useCompaniesStore } from "@/stores/companies-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import MenuIcon from "@/public/assets/images/_common/menu.svg";

// On phones and tablets the sidebar is hidden, so every page needs a way to open it.
// Companies has its own header with this button, so the bar is not shown there.
export default function MobileBar() {
  const pathname = usePathname();
  const setSidebarOpen = useCompaniesStore((state) => state.setSidebarOpen);
  if (pathname === "/") return null;
  return (
    <div className="border-sidebar-border bg-sidebar flex shrink-0 items-center gap-2 border-b px-2 py-1.5 lg:hidden">
      <Button variant="ghost" size="none" className="size-11 rounded-xl" aria-label="Open the menu" onClick={() => setSidebarOpen(true)}>
        <MenuIcon aria-hidden className="size-4" />
      </Button>
      <Logo aria-hidden className="size-6 shrink-0" />
      <span className="font-medium tracking-[-0.01em]">Sales CRM</span>
    </div>
  );
}
