"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { LINK } from "@/components/workspace/parts";

// One announcement at a time. Change the id to show a new one to everyone again.
export const NEWS = {
  id: "markets-2026-11",
  title: "New: markets, NGO jobs, conferences and lessons",
  points: [
    "Markets: the official naira rate and Nigerian market news every morning.",
    "NGO jobs and conferences, found for you each day.",
    "Books and podcasts in lessons of 2 hours or less, and notes now draw how ideas connect.",
  ],
  cta: { href: "/market", label: "See markets" },
  more: { href: "/ngo", label: "NGO jobs" },
  hideOn: ["/market", "/help"],
};
const KEY = "whats-new-dismissed";

const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) === NEWS.id;
  } catch {
    return false;
  }
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export default function WhatsNew() {
  const pathname = usePathname();
  // Hidden on the server and until the browser says whether it was dismissed, so it never flashes.
  const dismissed = useSyncExternalStore(subscribe, read, () => true);
  if (dismissed || NEWS.hideOn.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, NEWS.id);
    } catch {}
    listeners.forEach((fn) => fn());
    window.dispatchEvent(new Event("whats-new-dismissed"));
    document.getElementById("main")?.focus();
  }

  return (
    <aside aria-labelledby="whats-new-title" className="border-b border-white/10 bg-white/[0.04] px-4 py-4 md:px-8">
      <div className="mx-auto flex max-w-[64em] flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <p id="whats-new-title" className="text-[16px] font-semibold">
            {NEWS.title}
          </p>
          <ul className="text-soft flex list-disc flex-col gap-0.5 pl-5 text-[14px] leading-normal">
            {NEWS.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href={NEWS.cta.href} className="bg-foreground text-background focus-visible:ring-ring inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2">
            {NEWS.cta.label}
          </Link>
          <Link href={NEWS.more.href} className={`${LINK} inline-flex min-h-11 items-center px-2 text-[14px]`}>
            {NEWS.more.label}
          </Link>
          <button type="button" onClick={dismiss} className="text-soft hover:text-foreground focus-visible:ring-ring inline-flex h-11 items-center rounded-xl px-3 text-[14px] outline-none focus-visible:ring-2">
            Dismiss<span className="sr-only"> this announcement</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
