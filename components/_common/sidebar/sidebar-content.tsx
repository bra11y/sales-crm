"use client";

import { usePathname } from "next/navigation";
import Button from "@/components/_ui/button";
import ProductSwitcher from "./product-switcher";
import { ScrollArea } from "@/components/_ui/scroll-area";
import SidebarNavItem from "./sidebar-nav-item";
import SidebarSection from "./sidebar-section";
import { useCompaniesStore } from "@/stores/companies-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import BuildingIcon from "@/public/assets/images/companies/sidebar/building.svg";
import ClipboardIcon from "@/public/assets/images/companies/sidebar/clipboard.svg";
import BarChartIcon from "@/public/assets/images/companies/sidebar/bar-chart.svg";
import ListIcon from "@/public/assets/images/companies/sidebar/list.svg";
import BookClosedIcon from "@/public/assets/images/companies/sidebar/book-closed.svg";
import MailIcon from "@/public/assets/images/companies/sidebar/mail.svg";
import TargetIcon from "@/public/assets/images/companies/sidebar/target-05.svg";
import TargetAltIcon from "@/public/assets/images/companies/sidebar/target-03.svg";
import UsersIcon from "@/public/assets/images/companies/sidebar/users.svg";
import BarChartAltIcon from "@/public/assets/images/companies/sidebar/bar-chart-10.svg";
import AlertTriangleIcon from "@/public/assets/images/companies/sidebar/alert-triangle.svg";
import DotYellow from "@/public/assets/images/companies/sidebar/dot-yellow.svg";
import DotPink from "@/public/assets/images/companies/sidebar/dot-pink.svg";
import DotPurple from "@/public/assets/images/companies/sidebar/dot-purple.svg";
import UserPlusIcon from "@/public/assets/images/companies/sidebar/user-plus.svg";
import MessageQuestionIcon from "@/public/assets/images/companies/sidebar/message-question.svg";
import WalletIcon from "@/public/assets/images/companies/sidebar/wallet.svg";

export default function SidebarContent() {
  const companyCount = useCompaniesStore((state) => state.companies.length);
  const hydrated = useCompaniesStore((state) => state.hydrated);
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center gap-2 border-b p-3">
        <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="lead-style block truncate font-medium tracking-[-0.01em]">
            Sales CRM
          </span>
          <span className="caption-style text-subtle block truncate">
            Company pipeline
          </span>
        </div>
      </div>

      {pathname === "/" && <ProductSwitcher />}

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary">
          <SidebarSection className="border-sidebar-border border-b">
            <SidebarNavItem
              icon={BuildingIcon}
              label="Companies"
              count={hydrated ? companyCount : undefined}
              href="/"
              active={pathname === "/"}
            />
            <SidebarNavItem icon={ClipboardIcon} label="Deals Board" />
            <SidebarNavItem icon={BarChartIcon} label="Forecast" />
            <SidebarNavItem icon={ListIcon} label="Activities" />
            <SidebarNavItem icon={BookClosedIcon} label="Contacts" />
            <SidebarNavItem icon={MailIcon} label="Email Sequences" />
          </SidebarSection>

          <SidebarSection
            title="Sales"
            className="border-sidebar-border border-b"
          >
            <SidebarNavItem icon={TargetIcon} label="Jobs" href="/jobs" active={pathname === "/jobs"} />
            <SidebarNavItem icon={MailIcon} label="Apply" href="/apply" active={pathname === "/apply"} />
            <SidebarNavItem icon={ListIcon} label="Outbox" href="/outbox" active={pathname === "/outbox"} />
            <SidebarNavItem icon={UsersIcon} label="Profile" href="/profile" active={pathname === "/profile"} />
            <SidebarNavItem icon={BarChartAltIcon} label="Overview" href="/overview" active={pathname === "/overview"} />
            <SidebarNavItem icon={WalletIcon} label="Subscriptions" href="/subscriptions" active={pathname === "/subscriptions"} />
            <SidebarNavItem icon={ClipboardIcon} label="Payments" href="/payments" active={pathname === "/payments"} />
            <SidebarNavItem icon={ListIcon} label="Integrations" href="/integrations" active={pathname === "/integrations"} />
          </SidebarSection>

          <SidebarSection
            title="Team"
            className="border-sidebar-border border-b"
          >
            <SidebarNavItem icon={TargetIcon} label="Strategic AEs" />
            <SidebarNavItem icon={TargetAltIcon} label="Mid Market" />
            <SidebarNavItem icon={UsersIcon} label="SDR Team" />
          </SidebarSection>

          <SidebarSection
            title="Reporting"
            className="border-sidebar-border border-b"
          >
            <SidebarNavItem icon={BarChartAltIcon} label="Q1 Forecast" />
            <SidebarNavItem icon={AlertTriangleIcon} label="Slipping Deals" />
          </SidebarSection>

          <SidebarSection title="Pipelines">
            <SidebarNavItem icon={DotYellow} label="North America" />
            <SidebarNavItem icon={DotPink} label="EMEA Enterprise" />
            <SidebarNavItem icon={DotPurple} label="APAC Expansion" />
          </SidebarSection>
        </nav>
      </ScrollArea>

      <SidebarSection className="border-sidebar-border shrink-0 border-t border-b">
        <SidebarNavItem
          icon={UserPlusIcon}
          label="Invite teammates"
          tone="quiet"
        />
        <SidebarNavItem icon={MessageQuestionIcon} label="Help" tone="quiet" />
      </SidebarSection>

      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center justify-between gap-2 border-b p-4">
        <div className="flex flex-col gap-2">
          <span className="lead-style block font-medium tracking-[-0.01em]">
            14 Days
          </span>
          <span className="caption-style text-subtle block">
            Left on trials
          </span>
        </div>
        <Button variant="muted" size="md">
          <WalletIcon aria-hidden className="size-3.5" />
          Add Billings
        </Button>
      </div>
    </div>
  );
}
