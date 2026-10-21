import type { Metadata } from "next";
import Button from "@/components/_ui/button";
import ForgotForm from "./forgot-form";

export const metadata: Metadata = { title: "Reset your password · Sales CRM", robots: { index: false } };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-[24em] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1>Reset your password</h1>
          <p className="text-soft leading-normal">Enter your email. We will send a link to choose a new password.</p>
        </div>
        {expired && (
          <p role="alert" className="text-destructive">
            That reset link has expired or was opened on another device. Ask for a new one below.
          </p>
        )}
        <ForgotForm />
        <Button variant="link" size="none" href="/login" className="inline-flex min-h-11 items-center self-start">
          Back to sign in
        </Button>
      </div>
    </main>
  );
}
