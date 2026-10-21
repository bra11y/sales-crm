import type { Metadata } from "next";
import NewPasswordForm from "./new-password-form";

export const metadata: Metadata = { title: "Choose a new password · Sales CRM", robots: { index: false } };

export default function NewPasswordPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-[24em] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1>Choose a new password</h1>
          <p className="text-soft leading-normal">You will stay signed in on this device.</p>
        </div>
        <NewPasswordForm />
      </div>
    </main>
  );
}
