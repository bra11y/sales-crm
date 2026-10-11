import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Sign in · Sales CRM", robots: { index: false } };

export default function LoginPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-[24em] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1>Sign in to the Sales CRM</h1>
          <p className="text-subtle">For the owner and invited team members.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
