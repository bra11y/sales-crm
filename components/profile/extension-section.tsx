"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import { makeExtensionCode, revokeExtensionCode } from "@/app/(crm)/profile/actions";

export type ExtensionState = { created_at: string; last_used_at: string | null } | null;

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Connects the Chrome extension that fills application forms.
export default function ExtensionSection({ extension }: { extension: ExtensionState }) {
  const id = useId();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, start] = useTransition();

  function make() {
    if (busy) return;
    start(async () => {
      setProblem("");
      const r = await makeExtensionCode();
      if (!r.ok) return setProblem(r.error);
      setCode(r.code);
      setNote("New code made. Any older code stops working.");
      requestAnimationFrame(() => document.getElementById(`${id}-code`)?.focus());
      router.refresh();
    });
  }

  function revoke() {
    if (busy) return;
    start(async () => {
      const r = await revokeExtensionCode();
      if (!r.ok) return setProblem(r.error);
      setCode("");
      setNote("The code is turned off. The extension can no longer read your Profile.");
      router.refresh();
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setNote("Code copied. Paste it into the extension.");
    } catch {
      setProblem("Your browser blocked copying. Select the code and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 leading-normal">
        <li>
          In Chrome, go to <strong>chrome://extensions</strong> and turn on <strong>Developer mode</strong>.
        </li>
        <li>
          Press <strong>Load unpacked</strong> and choose the <strong>extension</strong> folder inside the sales-crm project.
        </li>
        <li>Make a connection code below, and paste it into the extension once.</li>
        <li>
          On any application form, open the extension and press <strong>Fill this form</strong>. Read what it filled, then press Submit yourself.
        </li>
      </ol>

      <p className="text-soft leading-normal">
        {extension
          ? `Connected. Code made ${when(extension.created_at)}${extension.last_used_at ? `, last used ${when(extension.last_used_at)}` : ", not used yet"}.`
          : "Not connected yet."}
      </p>

      {code && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-code`} className="text-[14px] font-medium">
            Your connection code (shown once)
          </label>
          <div className="flex flex-wrap gap-2">
            <input id={`${id}-code`} readOnly value={code} onFocus={(e) => e.target.select()} className="border-line-strong bg-secondary focus-visible:ring-ring h-11 min-w-0 flex-1 rounded-xl border px-3 font-mono text-[14px] outline-none focus-visible:ring-2" />
            <Button variant="secondary" size="md" className="h-11 px-4" onClick={copy}>
              Copy code
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant={extension ? "secondary" : "primary"} size="md" className="h-11 rounded-xl px-5 active:scale-[0.97] motion-reduce:active:scale-100" onClick={make} aria-disabled={busy}>
          {extension ? "Make a new code" : "Make a connection code"}
        </Button>
        {extension && (
          <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={revoke} aria-disabled={busy}>
            Turn off the code
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" className="text-soft empty:hidden">
        {note}
      </p>
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
