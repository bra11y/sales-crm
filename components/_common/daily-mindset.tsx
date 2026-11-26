"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { NEWS } from "@/components/_common/whats-new";
import { dayKey, MINDSETS, mindsetFor } from "@/lib/motivation";

// Today's mindset, the first time you open the app each day. The other four lines move past
// every 8 seconds; Pause stops them (WCAG 2.2.2), and with reduced motion they wait for you.
const KEY = "mindset-seen";
const NEWS_KEY = "whats-new-dismissed";
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("whats-new-dismissed", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("whats-new-dismissed", fn);
  };
};
const snapshot = () => {
  try {
    return `${localStorage.getItem(KEY) ?? ""}|${localStorage.getItem(NEWS_KEY) ?? ""}`;
  } catch {
    return "|";
  }
};

export default function DailyMindset() {
  const newsId = NEWS.id;
  const raw = useSyncExternalStore(subscribe, snapshot, () => "hidden");
  const today = mindsetFor();
  const start = MINDSETS.indexOf(today);
  const [at, setAt] = useState(start);
  const [paused, setPaused] = useState(false);
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setCalm(q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);

  const [seen, news] = raw.split("|");
  const hidden = raw === "hidden" || seen === dayKey() || news !== newsId;

  useEffect(() => {
    if (hidden || paused || calm) return;
    const t = setInterval(() => setAt((n) => (n + 1) % MINDSETS.length), 8000);
    return () => clearInterval(t);
  }, [hidden, paused, calm]);

  if (hidden) return null;
  const m = MINDSETS[at];
  const isToday = m === today;

  function done() {
    try {
      localStorage.setItem(KEY, dayKey());
    } catch {}
    listeners.forEach((fn) => fn());
    document.getElementById("main")?.focus();
  }

  return (
    <aside aria-labelledby="mindset-title" className="border-b border-white/10 bg-white/[0.03] px-4 py-3.5 md:px-8">
      <div className="mx-auto flex max-w-[64em] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p id="mindset-title" className="text-soft text-[13px] font-medium">
            Today&rsquo;s mindset: {today.name}
          </p>
          <div aria-live={paused || calm ? "polite" : "off"} className="min-h-[3.25em]">
            <p key={m.name} className="animate-in fade-in text-[15px] leading-snug font-medium duration-500 motion-reduce:animate-none">
              <span className="text-foreground">{m.name}.</span> {m.line}
            </p>
            {isToday && <p className="text-soft mt-0.5 text-[14px]">Today: {today.today}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!calm && (
            <button type="button" onClick={() => setPaused((p) => !p)} className="text-soft hover:text-foreground focus-visible:ring-ring min-h-10 rounded-lg px-3 text-[14px] outline-none hover:bg-white/[0.06] focus-visible:ring-2">
              {paused ? "Play" : "Pause"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setAt((n) => (n + 1) % MINDSETS.length);
              setPaused(true);
            }}
            className="text-soft hover:text-foreground focus-visible:ring-ring min-h-10 rounded-lg px-3 text-[14px] outline-none hover:bg-white/[0.06] focus-visible:ring-2"
          >
            Next mindset
          </button>
          <button type="button" onClick={done} className="bg-secondary focus-visible:ring-ring min-h-10 rounded-lg px-3.5 text-[14px] font-medium outline-none hover:bg-white/[0.12] focus-visible:ring-2">
            Got it for today
          </button>
        </div>
      </div>
    </aside>
  );
}
