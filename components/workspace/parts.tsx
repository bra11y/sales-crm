import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared parts for the workspace pages: a large title, Notion-style view tabs,
// stat tiles and Apple-style grouped lists.

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className={cn("mx-auto flex w-full flex-col gap-8 px-4 py-8 md:px-8", wide ? "max-w-[90em]" : "max-w-[64em]")}>{children}</div>
    </div>
  );
}

export function PageHead({ title, intro, actions, views }: { title: string; intro?: ReactNode; actions?: ReactNode; views?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.025em]">{title}</h1>
          {intro && <p className="text-soft max-w-[42em] leading-normal">{intro}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {views}
    </header>
  );
}

export type View = { href: string; label: string; count?: number };

// Views of the same data, like Notion database tabs. Plain links, so they work without JavaScript.
export function ViewTabs({ label, views, current }: { label: string; views: View[]; current: string }) {
  return (
    <nav aria-label={label} className="border-border -mx-1 flex gap-1 overflow-x-auto border-b px-1">
      {views.map((v) => {
        const active = v.href === current;
        return (
          <Link
            key={v.href}
            href={v.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring -mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 text-[14px] outline-none focus-visible:ring-2",
              active ? "border-foreground text-foreground font-medium" : "text-soft hover:text-foreground border-transparent",
            )}
          >
            {v.label}
            {v.count !== undefined && <span className="text-soft tabular-nums">{v.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export type Stat = { label: string; value: string; sub?: ReactNode; tone?: "good" | "bad" };

export function Stats({ stats, label }: { stats: Stat[]; label: string }) {
  return (
    <dl aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-1.5 rounded-2xl bg-white/[0.04] px-4 py-3.5">
          <dt className="text-soft text-[14px]">{s.label}</dt>
          <dd className="text-[26px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{s.value}</dd>
          {s.sub && <dd className={cn("text-[13px]", s.tone === "bad" ? "text-danger" : s.tone === "good" ? "text-success" : "text-soft")}>{s.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function Group({ title, count, empty, action, children }: { title: string; count?: number; empty?: string; action?: ReactNode; children?: ReactNode }) {
  const id = `g-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const has = count === undefined ? true : count > 0;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 px-4">
        <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em]">
          {title} {count !== undefined && <span className="text-soft font-normal tabular-nums">{count}</span>}
        </h2>
        {action}
      </div>
      {has ? (
        <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.04]">{children}</ul>
      ) : (
        <p className="text-soft rounded-2xl bg-white/[0.04] px-4 py-3.5 text-[14px]">{empty}</p>
      )}
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl bg-white/[0.04] px-5 py-6">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="text-soft max-w-[36em] leading-normal">{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export const LINK = "underline underline-offset-2 hover:text-foreground focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2";
