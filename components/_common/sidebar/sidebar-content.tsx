"use client";

import { Suspense, type SVGProps } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ProductSwitcher from "./product-switcher";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { NavFooter, type NavEntry, NavRow, NavSection } from "./sidebar-nav";
import { useCompaniesStore } from "@/stores/companies-store";
import { can, type Role } from "@/lib/auth/permissions";
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
  role: Role;
  pipelines: { slug: string; name: string; count: number }[];
  trialsEnding: number;
  queued: number;
  // Applications waiting on, or in, a reply.
  applications: number;
  // Your bills due in the next 3 days, or late.
  billsDue: number;
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

function Nav({ data, deal }: { data: SidebarData; deal: string | null }) {
  const pathname = usePathname();
  const companyCount = useCompaniesStore((state) => state.companies.length);
  const hydrated = useCompaniesStore((state) => state.hydrated);
  const at = (...paths: string[]) => paths.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
  const has = (p: Parameters<typeof can>[1]) => can(data.role, p);

  const jobs: NavEntry[] = [
    {
      id: "find-jobs",
      label: "Find jobs",
      icon: TargetIcon,
      children: [
        { label: "All jobs", href: "/jobs", active: at("/jobs") },
        { label: "NGO jobs", href: "/ngo", active: at("/ngo") },
        { label: "Freelance and audits", href: "/freelance", active: at("/freelance") },
      ],
    },
    { label: "Applications", href: "/applications", icon: ClipboardIcon, count: data.applications, active: at("/applications", "/outbox") },
    { label: "CV and letter", href: "/apply", icon: MailIcon, active: at("/apply") },
    { label: "Profile", href: "/profile", icon: UsersIcon, active: at("/profile") },
  ];
  const opportunities: NavEntry[] = [
    { label: "Grants", href: "/grants", icon: WalletIcon, active: at("/grants") },
    { label: "Scholarships", href: "/scholarships", icon: BookClosedIcon, active: at("/scholarships") },
    { label: "Conferences", href: "/conferences", icon: UsersIcon, active: at("/conferences") },
  ];
  const learn: NavEntry[] = [
    { label: "Notes", href: "/notes", icon: ListIcon, active: at("/notes") },
    { label: "Books and podcasts", href: "/books", icon: BookClosedIcon, active: at("/books") },
  ];
  const plan: NavEntry[] = [
    { label: "Goals", href: "/goals", icon: TargetAltIcon, active: at("/goals", "/plans") },
    { label: "Documents", href: "/documents", icon: ClipboardIcon, active: at("/documents") },
    { label: "Markets", href: "/market", icon: BarChartAltIcon, active: at("/market") },
    { label: "Bills", href: "/bills", icon: WalletIcon, count: data.billsDue, active: at("/bills") },
  ];
  const sales: NavEntry[] = [
    { label: "Companies", href: "/", icon: BuildingIcon, count: hydrated && pathname === "/" ? companyCount : undefined, active: pathname === "/" },
    {
      id: "deals",
      label: "Deals",
      icon: ClipboardIcon,
      children: [
        { label: "Board", href: "/deals", active: pathname === "/deals" && !deal },
        ...data.pipelines.map((p, i) => ({ label: p.name, href: `/deals?product=${p.slug}`, icon: Dot, iconClassName: DOT_CLASSES[i % DOT_CLASSES.length], count: p.count, active: deal === p.slug })),
        { label: "Slipping deals", href: "/deals?view=slipping", icon: AlertTriangleIcon, iconClassName: "text-(--tag-amber-text)", active: deal === "slipping" },
      ],
    },
    { label: "Forecast", href: "/forecast", icon: BarChartIcon, active: at("/forecast") },
    { label: "Activity", href: "/activity", icon: ListIcon, active: at("/activity") },
    { label: "Contacts", href: "/contacts", icon: BookClosedIcon, active: at("/contacts") },
  ];
  const business: NavEntry[] = [
    { label: "Overview", href: "/overview", icon: BarChartAltIcon, active: at("/overview") },
    { label: "Payments", href: "/payments", icon: ClipboardIcon, active: at("/payments") },
    { label: "Subscriptions", href: "/subscriptions", icon: WalletIcon, count: data.trialsEnding, active: at("/subscriptions") },
    { label: "Integrations", href: "/integrations", icon: ListIcon, active: at("/integrations") },
    ...(has("team:manage") ? [{ label: "Team and invites", href: "/team", icon: UserPlusIcon, active: at("/team") }] : []),
  ];

  return (
    <nav aria-label="Primary" className="flex flex-col gap-3 px-2 py-2">
      <NavSection id="jobs" title="Job search" entries={jobs} />
      <NavSection id="opportunities" title="Opportunities" entries={opportunities} />
      <NavSection id="learn" title="Learn" entries={learn} />
      <NavSection id="plan" title="Plan and money" entries={plan} defaultOpen={false} />
      {has("crm:use") && <NavSection id="sales" title="Sales" entries={sales} defaultOpen={false} />}
      {has("money:use") && <NavSection id="business" title="Business" entries={business} defaultOpen={false} />}
    </nav>
  );
}

function NavWithDeal({ data }: { data: SidebarData }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const deal = pathname === "/deals" ? (params.get("view") === "slipping" ? "slipping" : params.get("product")) : null;
  return <Nav data={data} deal={deal} />;
}

export default function SidebarContent({ data }: { data: SidebarData }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 px-4 pt-4 pb-2">
        <Logo aria-hidden className="size-7 shrink-0 overflow-visible" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="block truncate text-[14px] leading-none font-semibold tracking-[-0.01em]">Sales CRM</span>
          <span className="text-sidebar-label block truncate text-[12px] leading-none">{data.role === "seeker" ? "Jobs, learning and goals" : "Your apps and job search"}</span>
        </div>
      </div>

      {pathname === "/" && <ProductSwitcher />}

      <ScrollArea className="min-h-0 flex-1">
        {/* Reading the URL query needs a Suspense boundary; the plain list shows meanwhile. */}
        <Suspense fallback={<Nav data={data} deal={null} />}>
          <NavWithDeal data={data} />
        </Suspense>
      </ScrollArea>

      <div className="border-sidebar-border shrink-0 border-t px-2 py-2">
        <NavFooter>
          <NavRow link={{ label: "Settings", href: "/settings", icon: ListIcon, active: pathname === "/settings" }} />
          <NavRow link={{ label: "Help and tour", href: "/help", icon: MessageQuestionIcon, active: pathname === "/help" }} />
        </NavFooter>
      </div>
    </div>
  );
}
