"use client";

import Link from "next/link";
import { Collapsible } from "radix-ui";
import { type ComponentType, type ReactNode, type SVGProps, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import CountBadge from "@/components/_ui/count-badge";
import { cn } from "@/lib/utils";
import ChevronIcon from "@/public/assets/images/_common/chevron-down.svg";

export type Icon = ComponentType<SVGProps<SVGSVGElement>>;
export type NavLink = { label: string; href: string; icon?: Icon; iconClassName?: string; count?: number; active: boolean };
export type NavParent = { label: string; icon: Icon; id: string; children: NavLink[]; count?: number };
export type NavEntry = NavLink | NavParent;
export const isParent = (e: NavEntry): e is NavParent => "children" in e;

// Which sections and sub-menus you opened or closed, kept in this browser. A section with the page
// you are on always starts open.
const KEY = "sidebar:open";
const listeners = new Set<() => void>();
function readOpen(): string {
  try {
    return localStorage.getItem(KEY) ?? "{}";
  } catch {
    return "{}";
  }
}
function useOpenState(id: string, fallback: boolean): [boolean, (open: boolean) => void] {
  const raw = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    readOpen,
    () => "{}",
  );
  let saved: Record<string, boolean> = {};
  try {
    saved = JSON.parse(raw) as Record<string, boolean>;
  } catch {}
  const open = typeof saved[id] === "boolean" ? saved[id] : fallback;
  const set = useCallback(
    (next: boolean) => {
      try {
        const all = JSON.parse(readOpen()) as Record<string, boolean>;
        localStorage.setItem(KEY, JSON.stringify({ ...all, [id]: next }));
      } catch {}
      listeners.forEach((fn) => fn());
    },
    [id],
  );
  return [open, set];
}

// When you arrive on a page inside a closed group, the group opens so you can see where you are.
// Closing it again afterwards is up to you.
function useOpenOnArrival(here: boolean, open: boolean, set: (open: boolean) => void) {
  const was = useRef(false);
  useEffect(() => {
    if (here && !was.current && !open) set(true);
    was.current = here;
  }, [here, open, set]);
}

const ROW =
  "group flex h-8 max-lg:h-11 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-[13.5px] leading-none text-sidebar-foreground outline-none transition-colors duration-150 ease-power3-out hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-white/[0.08] motion-reduce:transition-none";
const ACTIVE = "bg-white/[0.09] font-medium text-foreground hover:bg-white/[0.09]";

function Row({ link, nested = false }: { link: NavLink; nested?: boolean }) {
  const I = link.icon;
  return (
    <li>
      <Link href={link.href} aria-current={link.active ? "page" : undefined} className={cn(ROW, nested && "pl-[34px]", link.active && ACTIVE)}>
        {I && !nested && <I aria-hidden className={cn("size-4 shrink-0 text-sidebar-foreground group-hover:text-icon", link.active && "text-icon", link.iconClassName)} />}
        {I && nested && link.iconClassName && <I aria-hidden className={cn("-ml-5 size-3.5 shrink-0", link.iconClassName)} />}
        <span className="min-w-0 flex-1 truncate">{link.label}</span>
        {link.count ? <CountBadge>{link.count}</CountBadge> : null}
      </Link>
    </li>
  );
}

function Parent({ entry }: { entry: NavParent }) {
  const here = entry.children.some((c) => c.active);
  const [open, setOpen] = useOpenState(entry.id, here);
  useOpenOnArrival(here, open, setOpen);
  const I = entry.icon;
  return (
    <li>
      <Collapsible.Root open={open} onOpenChange={(o) => setOpen(o)}>
        <Collapsible.Trigger className={cn(ROW, here && !open && ACTIVE)}>
          <I aria-hidden className={cn("size-4 shrink-0 text-sidebar-foreground group-hover:text-icon", here && "text-icon")} />
          <span className="min-w-0 flex-1 truncate text-left">{entry.label}</span>
          {entry.count && !open ? <CountBadge>{entry.count}</CountBadge> : null}
          <ChevronIcon aria-hidden className="size-3 shrink-0 -rotate-90 transition-transform duration-200 ease-power3-out group-data-[state=open]:rotate-0 motion-reduce:transition-none" />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {entry.children.map((c) => (
              <Row key={c.href} link={c} nested />
            ))}
          </ul>
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
}

export function NavList({ entries }: { entries: NavEntry[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map((e) => (isParent(e) ? <Parent key={e.id} entry={e} /> : <Row key={e.href} link={e} />))}
    </ul>
  );
}

// A titled group, like a Finder sidebar section: the title folds it away.
export function NavSection({ id, title, entries, defaultOpen = true }: { id: string; title: string; entries: NavEntry[]; defaultOpen?: boolean }) {
  const here = entries.some((e) => (isParent(e) ? e.children.some((c) => c.active) : e.active));
  const [open, setOpen] = useOpenState(`section:${id}`, defaultOpen || here);
  useOpenOnArrival(here, open, setOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={(o) => setOpen(o)} className="flex flex-col gap-0.5">
      <Collapsible.Trigger className="group text-sidebar-label hover:text-foreground focus-visible:ring-ring/60 flex h-7 w-full items-center justify-between rounded-md px-2 text-[12px] font-semibold tracking-[0.01em] outline-none focus-visible:ring-2">
          {title}
          {!open && here && <span className="sr-only">, has the page you are on</span>}
          <ChevronIcon aria-hidden className="size-3 -rotate-90 opacity-0 transition-[transform,opacity] duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=closed]:opacity-100 group-data-[state=open]:rotate-0 motion-reduce:transition-none" />
        </Collapsible.Trigger>
      <Collapsible.Content>
        <NavList entries={entries} />
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function NavFooter({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-0.5">{children}</ul>;
}


export { Row as NavRow };
