"use client";

import { Suspense, type SVGProps } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
import UserPlusIcon from "@/public/assets/images/companies/sidebar/user-plus.svg";
import MessageQuestionIcon from "@/public/assets/images/companies/sidebar/message-question.svg";
import WalletIcon from "@/public/assets/images/companies/sidebar/wallet.svg";

export type SidebarData = {
  pipelines: { slug: string; name: string; count: number }[];
  trialsEnding: number;
  queued: number;
  // Applications waiting on, or in, a reply.
  applications: number;
};

// Fixed order, one per pipeline, never re-ranked (same hues as the charts).
const DOT_CLASSES = ["!text-[#3987e5]", "!text-[#199e70]", "!text-[#c98500]", "!text-[#d55181]", "!text-[#9085e9]", "!text-[#d95926]"];

function Dot(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 14 14" {...props}>
      <circle cx="7" cy="7" r="3.5" fill="currentColor" />
    </svg>
  );
}

function PipelineLinks({ data, read }: { data: SidebarData; read?: boolean }) {
  return read ? <ActivePipelineLinks data={data} /> : <PipelineList data={data} />;
}

function ActivePipelineLinks({ data }: { data: SidebarData }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return <PipelineList data={data} active={pathname === "/deals" ? (params.get("view") === "slipping" ? "slipping" : params.get("product")) : null} />;
}

function PipelineList({ data, active = null }: { data: SidebarData; active?: string | null }) {
  return (
    <>
      {data.pipelines.map((p, i) => (
        <SidebarNavItem key={p.slug} icon={Dot} iconClassName={DOT_CLASSES[i % DOT_CLASSES.length]} label={p.name} count={p.count} href={`/deals?product=${p.slug}`} active={active === p.slug} />
      ))}
      <SidebarNavItem icon={AlertTriangleIcon} label="Slipping deals" href="/deals?view=slipping" active={active === "slipping"} />
    </>
  );
}

export default function SidebarContent({ data }: { data: SidebarData }) {
  const companyCount = useCompaniesStore((state) => state.companies.length);
  const hydrated = useCompaniesStore((state) => state.hydrated);
  const pathname = usePathname();
  const at = (href: string) => pathname === href;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center gap-2 border-b p-3">
        <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="lead-style block truncate font-medium tracking-[-0.01em]">Sales CRM</span>
          <span className="caption-style text-subtle block truncate">Your apps and job search</span>
        </div>
      </div>

      {pathname === "/" && <ProductSwitcher />}

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary">
          <SidebarSection title="Workspace" className="border-sidebar-border border-b">
            <SidebarNavItem icon={BuildingIcon} label="Companies" count={hydrated && pathname === "/" ? companyCount : undefined} href="/" active={at("/")} />
            <SidebarNavItem icon={ClipboardIcon} label="Deals board" href="/deals" active={at("/deals")} />
            <SidebarNavItem icon={BarChartIcon} label="Forecast" href="/forecast" active={at("/forecast")} />
            <SidebarNavItem icon={ListIcon} label="Activity" href="/activity" active={at("/activity")} />
            <SidebarNavItem icon={BookClosedIcon} label="Contacts" href="/contacts" active={at("/contacts")} />
            <SidebarNavItem icon={TargetAltIcon} label="Goals" href="/goals" active={at("/goals")} />
          </SidebarSection>

          <SidebarSection title="Job search" className="border-sidebar-border border-b">
            <SidebarNavItem icon={TargetIcon} label="Jobs" href="/jobs" active={at("/jobs")} />
            <SidebarNavItem icon={ClipboardIcon} label="Applications" count={data.applications || undefined} href="/applications" active={at("/applications")} />
            <SidebarNavItem icon={MailIcon} label="Apply" href="/apply" active={at("/apply")} />
            <SidebarNavItem icon={ListIcon} label="Outbox" count={data.queued || undefined} href="/outbox" active={at("/outbox")} />
            <SidebarNavItem icon={UsersIcon} label="Profile" href="/profile" active={at("/profile")} />
          </SidebarSection>

          <SidebarSection title="Grow" className="border-sidebar-border border-b">
            <SidebarNavItem icon={BookClosedIcon} label="Scholarships" href="/scholarships" active={at("/scholarships")} />
            <SidebarNavItem icon={ClipboardIcon} label="Documents" href="/documents" active={at("/documents")} />
            <SidebarNavItem icon={TargetAltIcon} label="Career goals" href="/plans" active={at("/plans")} />
            <SidebarNavItem icon={MessageQuestionIcon} label="Study and interviews" href="/study" active={at("/study")} />
            <SidebarNavItem icon={BarChartAltIcon} label="Labs" href="/labs" active={at("/labs")} />
          </SidebarSection>

          <SidebarSection title="Money" className="border-sidebar-border border-b">
            <SidebarNavItem icon={BarChartAltIcon} label="Overview" href="/overview" active={at("/overview")} />
            <SidebarNavItem icon={ClipboardIcon} label="Payments" href="/payments" active={at("/payments")} />
            <SidebarNavItem icon={WalletIcon} label="Subscriptions" href="/subscriptions" active={at("/subscriptions")} />
            <SidebarNavItem icon={ListIcon} label="Integrations" href="/integrations" active={at("/integrations")} />
          </SidebarSection>

          <SidebarSection title="Pipelines">
            {/* Reading the URL query needs a Suspense boundary; the plain list shows meanwhile. */}
            <Suspense fallback={<PipelineLinks data={data} />}>
              <PipelineLinks data={data} read />
            </Suspense>
          </SidebarSection>
        </nav>
      </ScrollArea>

      <SidebarSection className="border-sidebar-border shrink-0 border-t border-b">
        <SidebarNavItem icon={UserPlusIcon} label="Team and invites" tone="quiet" href="/team" active={at("/team")} />
        <SidebarNavItem icon={MessageQuestionIcon} label="Help" tone="quiet" href="/help" active={at("/help")} />
      </SidebarSection>

      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center justify-between gap-2 border-b p-4">
        <div className="flex flex-col gap-2">
          <span className="lead-style block font-medium tracking-[-0.01em] tabular-nums">
            {data.trialsEnding} {data.trialsEnding === 1 ? "trial" : "trials"}
          </span>
          <span className="caption-style text-subtle block">End in the next 7 days</span>
        </div>
        <Button variant="muted" size="md" href="/subscriptions?status=Trial">
          <WalletIcon aria-hidden className="size-3.5" />
          See trials
        </Button>
      </div>
    </div>
  );
}
