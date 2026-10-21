import type { Metadata } from "next";
import Button from "@/components/_ui/button";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Sign in · Sales CRM", robots: { index: false } };

export default function LoginPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-[24em] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1>Sign in to the Sales CRM</h1>
          <p className="text-soft">For the owner and invited team members.</p>
        </div>
        <LoginForm />
        <Button variant="link" size="none" href="/login/forgot" className="inline-flex min-h-11 items-center self-start">
          Forgot your password?
        </Button>
      </div>
    </main>
  );
}
