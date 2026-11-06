"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/_ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/_ui/dialog";

// A short tour for someone new: what each part of the app is for, in the order you use it.
// It opens by itself on the first visit, and "Take the tour" opens it again any time.

type Step = { title: string; body: string; href?: string; go?: string };

const START: Step[] = [
  {
    title: "Welcome",
    body: "This app helps you find work that fits you, apply faster, and keep learning while you search. The tour takes about a minute. You can leave it at any time with Esc.",
  },
  {
    title: "1. Fill in your Profile once",
    body: "Add your skills, experience and the jobs you want. Every job score, CV and cover letter is built only from what you write here, so keep it true and up to date.",
    href: "/profile",
    go: "Open Profile",
  },
  {
    title: "2. Find jobs that fit",
    body: "Jobs is searched for you each morning and scored against your Profile. Each job says why it fits, what is missing, and anything to check, like a closing date or a country rule.",
    href: "/jobs",
    go: "Open Jobs",
  },
  {
    title: "3. Apply with less typing",
    body: "Make a CV and cover letter for any job in one click. Jobs that take email can be sent from your Gmail with your CV attached. On a computer, the extension fills application forms. You always press Submit yourself.",
    href: "/apply",
    go: "Open CV and letter",
  },
  {
    title: "4. Track every application",
    body: "Applications shows what you sent and when. Replies in your Gmail move a job along by themselves, and follow-ups are written for you.",
    href: "/applications",
    go: "Open Applications",
  },
  {
    title: "5. Learn and remember",
    body: "Save a YouTube video, a recording or a book. You get a summary, study questions, post drafts and project ideas, and each note comes back for review so it sticks.",
    href: "/notes",
    go: "Open Notes",
  },
  {
    title: "6. Grow beyond the next job",
    body: "Books has free reading for your field. Scholarships, Documents and Goals keep your next steps in one private place.",
    href: "/books",
    go: "Open Books",
  },
];
const CRM: Step = {
  title: "Your business",
  body: "Companies, Deals, Forecast and Money show your apps' customers, payments and renewals. They update by themselves from your products.",
  href: "/",
  go: "Open Companies",
};
const END: Step = {
  title: "You are ready",
  body: "Start with your Profile, then look at today's jobs. Help explains every page, and you can take this tour again from the sidebar.",
  href: "/profile",
  go: "Start with your Profile",
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

export function TourButton({ className }: { className?: string }) {
  return (
    <Button variant="secondary" size="md" className={className ?? "h-11 rounded-xl px-4"} onClick={openTour}>
      Take the tour
    </Button>
  );
}

export default function Tour({ crm }: { crm: boolean }) {
  const steps = [...START, ...(crm ? [CRM] : []), END];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const step = steps[at];
  const last = at === steps.length - 1;

  useEffect(() => {
    const show = () => {
      setAt(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_TOUR, show);
    // First visit: open by itself, once the page has painted.
    const first = !seen() ? window.setTimeout(show, 600) : undefined;
    return () => {
      window.removeEventListener(OPEN_TOUR, show);
      window.clearTimeout(first);
    };
  }, []);

  function close(next: boolean) {
    if (!next) markSeen();
    setOpen(next);
  }

  // Each new step moves focus to its title, so a screen reader reads the new step.
  function goTo(i: number) {
    setAt(i);
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent aria-describedby="tour-body" className="max-w-[520px]">
        <div className="flex flex-col gap-4 px-6 pt-6 pb-5">
          <p className="text-soft text-[13px] tabular-nums">
            Step {at + 1} of {steps.length}
          </p>
          <DialogTitle ref={titleRef} tabIndex={-1} className="pr-8 text-[22px] leading-tight font-semibold tracking-[-0.015em] outline-none">
            {step.title}
          </DialogTitle>
          <DialogDescription id="tour-body" className="text-foreground text-[15px] leading-relaxed">
            {step.body}
          </DialogDescription>
          {step.href && step.href !== pathname && !last && (
            <Link href={step.href} onClick={() => close(false)} className="text-foreground focus-visible:ring-ring inline-flex min-h-11 w-fit items-center rounded-sm text-[15px] font-medium underline underline-offset-2 outline-none focus-visible:ring-2">
              {step.go}
              <span className="sr-only"> and end the tour</span>
            </Link>
          )}
          <div aria-hidden className="flex gap-1.5">
            {steps.map((s, i) => (
              <span key={s.title} className={`h-1.5 flex-1 rounded-full ${i <= at ? "bg-foreground" : "bg-white/15"}`} />
            ))}
          </div>
        </div>
        <div className="border-line-strong flex flex-wrap items-center justify-between gap-2 border-t px-6 py-4">
          <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => close(false)}>
            {last ? "Close" : "Skip the tour"}
          </Button>
          <div className="flex gap-2">
            {at > 0 && (
              <Button variant="secondary" size="md" className="h-11 rounded-xl px-4" onClick={() => goTo(at - 1)}>
                Back
              </Button>
            )}
            {last ? (
              <Button variant="primary" size="md" className="h-11 rounded-xl px-5" href={step.href} onClick={() => close(false)}>
                {step.go}
              </Button>
            ) : (
              <Button variant="primary" size="md" className="h-11 rounded-xl px-5" onClick={() => goTo(at + 1)}>
                Next<span className="sr-only">: step {at + 2} of {steps.length}</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
