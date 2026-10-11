"use client";

import { useActionState, useEffect, useRef } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { type LoginState, signIn } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.fields?.email) emailRef.current?.focus();
    else if (state.fields?.password) passwordRef.current?.focus();
    else if (state.error) passwordRef.current?.focus();
  }, [state]);

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
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
          aria-invalid={state.fields?.email ? true : undefined}
          aria-describedby={state.fields?.email ? "email-error" : undefined}
        />
        {state.fields?.email && (
          <p id="email-error" role="alert" className="text-destructive">
            {state.fields.email}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password (required)</Label>
        <Input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.fields?.password ? true : undefined}
          aria-describedby={state.fields?.password ? "password-error" : undefined}
        />
        {state.fields?.password && (
          <p id="password-error" role="alert" className="text-destructive">
            {state.fields.password}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
