"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import { connectMail, disconnectMail, sendMailTest } from "@/app/(crm)/profile/actions";

export type MailState = { email: string; test_sent_at: string | null } | null;

// Connects the user's own Gmail with an app password, so applications send from their address.
export default function MailSection({ mail, suggested }: { mail: MailState; suggested: string }) {
  const id = useId();
  const router = useRouter();
  const [email, setEmail] = useState(suggested);
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, start] = useTransition();

  function run(fn: () => Promise<{ ok: true; to?: string } | { ok: false; error: string }>, done: string, field?: string) {
    if (busy) return;
    start(async () => {
      setProblem("");
      setNote("Working…");
      const r = await fn();
      if (!r.ok) {
        setNote("");
        setProblem(r.error);
        if (field) document.getElementById(field)?.focus();
        return;
      }
      setPassword("");
      setNote(done);
      router.refresh();
    });
  }

  return (
    <div id="gmail" className="flex scroll-mt-6 flex-col gap-3">
      {mail ? (
        <>
          <p className="leading-normal">
            Connected as <strong>{mail.email}</strong>. Applications send from this address, and replies are read from its inbox.
          </p>
          <p className="leading-normal">{mail.test_sent_at ? "Test email sent. You can now send applications." : "Next step: send yourself a test email. Applications unlock after it arrives."}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant={mail.test_sent_at ? "secondary" : "primary"} size="md" className="h-11 px-4" onClick={() => run(sendMailTest, `Test sent to ${mail.email}. Check your inbox.`)} aria-disabled={busy}>
              Send me a test email
            </Button>
            <Button variant="ghost" size="md" className="text-soft h-11 px-3" onClick={() => run(disconnectMail, "Gmail disconnected. Emails waiting to send were cancelled.")} aria-disabled={busy}>
              Disconnect Gmail
            </Button>
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => connectMail(email, password), "Gmail connected. Now send yourself a test email.", `${id}-password`);
          }}
        >
          <ol className="flex list-decimal flex-col gap-1 pl-5 leading-normal">
            <li>
              Turn on 2-Step Verification in your Google account, if it is off.
            </li>
            <li>
              Open{" "}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" className="underline underline-offset-2">
                Google app passwords<span className="sr-only"> (opens in a new tab)</span>
              </a>
              , name it &ldquo;Sales CRM&rdquo; and press Create.
            </li>
            <li>Copy the 16-letter password and paste it below. It is locked before it is stored, and never shown again.</li>
          </ol>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-email`} className="text-[14px] font-medium">
              Gmail address (required)
            </label>
            <input id={`${id}-email`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="border-line-strong bg-secondary focus-visible:ring-ring h-11 rounded-lg border px-3 outline-none focus-visible:ring-2 sm:max-w-[24em]" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-password`} className="text-[14px] font-medium">
              App password (required)
            </label>
            <input
              id={`${id}-password`}
              type="password"
              autoComplete="off"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={problem ? true : undefined}
              aria-describedby={`${id}-password-hint${problem ? ` ${id}-problem` : ""}`}
              className="border-line-strong bg-secondary focus-visible:ring-ring h-11 rounded-lg border px-3 outline-none focus-visible:ring-2 sm:max-w-[24em]"
            />
            <p id={`${id}-password-hint`} className="caption-style text-soft">
              Not your normal Gmail password. Spaces are fine.
            </p>
          </div>
          <Button type="submit" variant="primary" size="md" className="h-11 self-start px-5" aria-disabled={busy}>
            {busy ? "Checking with Gmail…" : "Connect Gmail"}
          </Button>
        </form>
      )}
      <p role="status" aria-live="polite" className="text-soft empty:hidden">
        {note}
      </p>
      {problem && (
        <p id={`${id}-problem`} role="alert" className="text-danger leading-normal">
          {problem}
        </p>
      )}
    </div>
  );
}
