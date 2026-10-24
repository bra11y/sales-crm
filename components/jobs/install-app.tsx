"use client";

import { useEffect, useState } from "react";
import Button from "@/components/_ui/button";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Installing puts the CRM on the home screen. On Android it also joins the Share menu,
// so a screenshot goes from Photos to "Add a job" in two taps.
export default function InstallApp() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [state, setState] = useState<"unknown" | "installed" | "ios" | "other">("unknown");
  const [note, setNote] = useState("");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(standalone ? "installed" : ios ? "ios" : "other");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setState("installed");
      setNote("Installed. Find Sales CRM on your home screen.");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    if (outcome !== "accepted") setNote("Not installed. You can install it later from this page.");
  }

  if (state === "unknown") return null;
  return (
    <section aria-labelledby="install-h" className="flex max-w-[40rem] flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
      <h2 id="install-h" className="text-[17px] font-semibold">
        Add jobs straight from your phone
      </h2>
      {state === "installed" ? (
        <p className="text-soft leading-normal">The app is installed. On Android, open a screenshot, tap Share, then pick Sales CRM.</p>
      ) : state === "ios" ? (
        <ol className="text-soft list-decimal pl-5 leading-normal">
          <li>In Safari, tap the Share button.</li>
          <li>Tap “Add to Home Screen”, then Add.</li>
          <li>Open Sales CRM from your home screen, go to Add a job, and pick the screenshot from Photos.</li>
        </ol>
      ) : (
        <>
          <p className="text-soft leading-normal">
            Install the CRM as an app. On Android it then shows in the Share menu: open a screenshot, tap Share, pick Sales CRM, and the job is read and saved.
          </p>
          {prompt ? (
            <Button type="button" variant="primary" size="md" className="h-11 w-fit rounded-xl px-4" onClick={install}>
              Install the app
            </Button>
          ) : (
            <p className="text-soft text-[14px] leading-normal">To install, open this page in Chrome on your phone and tap “Install app” or “Add to Home screen” in the ⋮ menu.</p>
          )}
        </>
      )}
      <p role="status" aria-live="polite" className="text-[14px] empty:hidden">
        {note}
      </p>
    </section>
  );
}
