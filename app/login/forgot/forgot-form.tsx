"use client";

import { useActionState, useEffect, useRef } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { type ForgotState, requestReset } from "./actions";

export default function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestReset, {});
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) emailRef.current?.focus();
  }, [state]);

  if (state.sent)
    return (
      <p role="status" className="text-foreground leading-normal">
        If {state.email} has an account, a reset link is on its way. Open it on this device within 1 hour. Check your spam folder if it is not there in 5 minutes.
      </p>
    );

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email (required)</Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "email-error" : undefined}
          className="focus-visible:ring-ring h-11 focus-visible:ring-2"
        />
        {state.error && (
          <p id="email-error" role="alert" className="text-destructive">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" size="md" className="h-11" aria-disabled={pending}>
        {pending ? "Sending…" : "Email me a reset link"}
      </Button>
    </form>
  );
}
