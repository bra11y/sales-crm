"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/_ui/button";
import { useCompaniesStore } from "@/stores/companies-store";

// A short tour for someone new. It walks through the real pages: each step opens its page,
// says what it is for and where to find it, and outlines its link in the sidebar. The card
// sits at the bottom so the page stays in view. It opens by itself on the first visit, and
// "Take the tour" opens it again any time.

type Step = { title: string; body: string; href: string; where: string };

const START: Step[] = [
  {
    title: "Welcome",
    body: "This app helps you find work that fits you, apply faster, and keep learning while you search. Press Next to walk through it page by page. Press Esc to leave at any time.",
    href: "",
    where: "On a phone, the menu button is at the top left of every page.",
  },
  {
    title: "Your Profile",
    body: "Upload your CV and your skills, jobs and education are filled in for you to check. Every job score, CV and cover letter is built only from this page. Job rules, Gmail and the extension are in Settings.",
    href: "/profile",
    where: "Menu → Job search → Profile",
  },
  {
    title: "Jobs",
    body: "Jobs are searched for you each morning and scored against your Profile. Each one says why it fits, what is missing, and anything to check, like a closing date.",
    href: "/jobs",
    where: "Menu → Job search → Jobs",
  },
  {
    title: "CV and letter",
    body: "Make a CV and cover letter for any job. Jobs that take email can be sent from your Gmail with your CV attached. On a computer, the extension fills forms. You always press Submit.",
    href: "/apply",
    where: "Menu → Job search → CV and letter",
  },
  {
    title: "Applications",
    body: "Everything you sent, and when. Replies in your Gmail move a job along by themselves, and follow-ups are written for you.",
    href: "/applications",
    where: "Menu → Job search → Applications",
  },
  {
    title: "Notes",
    body: "Save a YouTube video, a recording or anything you read. You get a summary, study questions and post drafts, and the note comes back for review.",
    href: "/notes",
    where: "Menu → Learn → Notes",
  },
  {
    title: "Books",
    body: "Free books for your field, and your own PDF or EPUB books, each with a summary you can turn into a post or a project.",
    href: "/books",
    where: "Menu → Learn → Books",
  },
  {
    title: "Grow",
    body: "Scholarships, Documents and Goals keep your next steps in one private place: what to apply for, the papers you need, and what you are working towards.",
    href: "/goals",
    where: "Menu → Grow",
  },
];
const CRM: Step = {
  title: "Your business",
  body: "Companies, Deals, Forecast and Money show your apps' customers, payments and renewals. They update by themselves from your products.",
  href: "/",
  where: "Menu → Workspace and Money",
};
const END: Step = {
  title: "You are ready",
  body: "Start with your Profile, then look at today's jobs. Help explains every page, and you can take this tour again from the menu.",
  href: "/profile",
  where: "Menu → Take the tour, any time",
};

const KEY = "tour-seen";
export const OPEN_TOUR = "sales-crm:open-tour";
export const openTour = () => window.dispatchEvent(new Event(OPEN_TOUR));

const seen = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
};

// Outlines the step's link in the desktop sidebar, and removes the outline from the last one.
function outline(href: string) {
  document.querySelectorAll<HTMLElement>("[data-tour-mark]").forEach((el) => {
    el.removeAttribute("data-tour-mark");
    el.style.removeProperty("outline");
    el.style.removeProperty("outline-offset");
  });
  if (!href) return;
  document.querySelectorAll<HTMLElement>(`nav[aria-label="Primary"] a[href="${href}"]`).forEach((el) => {
    el.setAttribute("data-tour-mark", "");
    el.style.outline = "2px solid var(--ring)";
    el.style.outlineOffset = "2px";
  });
}

export function TourButton({ className }: { className?: string }) {
  return (
    <Button variant="secondary" size="md" className={className ?? "h-11 rounded-xl px-4"} onClick={openTour}>
      Take the tour
    </Button>
  );
}

export default function Tour({ crm }: { crm: boolean }) {
  const steps = [...START, ...(crm ? [CRM] : []), END];
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const step = steps[at];
  const last = at === steps.length - 1;

  const setSidebarOpen = useCompaniesStore((state) => state.setSidebarOpen);
  const show = useCallback(() => {
    setSidebarOpen(false);
    returnTo.current = document.activeElement as HTMLElement | null;
    setAt(0);
    setOpen(true);
    window.setTimeout(() => titleRef.current?.focus(), 50);
  }, [setSidebarOpen]);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
    outline("");
    returnTo.current?.focus?.();
  }, []);

  useEffect(() => {
    window.addEventListener(OPEN_TOUR, show);
    const first = !seen() ? window.setTimeout(show, 700) : undefined;
    return () => {
      window.removeEventListener(OPEN_TOUR, show);
      window.clearTimeout(first);
    };
  }, [show]);

  useEffect(() => {
    if (!open) return;
    outline(step.href);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step.href, pathname, close]);

  // Each step opens its page and moves focus to the step's title, so a screen reader reads it.
  function goTo(i: number) {
    const next = steps[i];
    setAt(i);
    if (next.href && next.href !== pathname) router.push(next.href);
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  if (!open) return null;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      className="border-line-strong bg-popover text-popover-foreground shadow-overlay fixed inset-x-3 bottom-3 z-50 flex max-h-[55dvh] flex-col overflow-y-auto rounded-2xl border sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[26rem]"
    >
      <div className="flex flex-col gap-2.5 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-soft text-[13px] tabular-nums">
            Tour · step {at + 1} of {steps.length}
          </p>
          <button type="button" onClick={close} className="text-soft hover:text-foreground focus-visible:ring-ring -mr-2 inline-flex size-11 items-center justify-center rounded-xl text-[20px] leading-none outline-none focus-visible:ring-2" aria-label="Close the tour">
            <span aria-hidden>×</span>
          </button>
        </div>
        <h2 id="tour-title" ref={titleRef} tabIndex={-1} className="text-[19px] leading-tight font-semibold tracking-[-0.015em] outline-none">
          {step.title}
        </h2>
        <p id="tour-body" className="text-[15px] leading-relaxed">
          {step.body}
        </p>
        <p className="text-soft text-[13px] leading-normal">
          <span className="font-medium">Where to find it:</span> {step.where}
        </p>
        <div aria-hidden className="flex gap-1 pt-1">
          {steps.map((s, i) => (
            <span key={s.title} className={`h-1 flex-1 rounded-full ${i <= at ? "bg-foreground" : "bg-white/15"}`} />
          ))}
        </div>
      </div>
      <div className="border-line-strong flex items-center justify-between gap-2 border-t px-5 py-3">
        <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={close}>
          {last ? "Close" : "Skip"}
        </Button>
        <div className="flex gap-2">
          {at > 0 && (
            <Button variant="secondary" size="md" className="h-11 rounded-xl px-4" onClick={() => goTo(at - 1)}>
              Back
            </Button>
          )}
          {last ? (
            <Button
              variant="primary"
              size="md"
              className="h-11 rounded-xl px-5"
              onClick={() => {
                close();
                if (pathname !== step.href) router.push(step.href);
              }}
            >
              Start with my Profile
            </Button>
          ) : (
            <Button variant="primary" size="md" className="h-11 rounded-xl px-5" onClick={() => goTo(at + 1)}>
              Next<span className="sr-only">: {steps[at + 1].title}</span>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
