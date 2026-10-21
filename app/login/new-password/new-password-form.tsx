"use client";

import { useActionState, useEffect, useRef } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { type NewPasswordState, setNewPassword } from "./actions";

export default function NewPasswordForm() {
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(setNewPassword, {});
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.fields?.password || state.error) passwordRef.current?.focus();
    else if (state.fields?.confirm) confirmRef.current?.focus();
  }, [state]);

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password (required)</Label>
        <Input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          aria-invalid={state.fields?.password ? true : undefined}
          aria-describedby={state.fields?.password ? "password-error password-hint" : "password-hint"}
          className="focus-visible:ring-ring h-11 focus-visible:ring-2"
        />
        <p id="password-hint" className="caption-style text-soft">
          At least 12 characters. A password manager can make one for you.
        </p>
        {state.fields?.password && (
          <p id="password-error" role="alert" className="text-destructive">
            {state.fields.password}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password (required)</Label>
        <Input
          ref={confirmRef}
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={state.fields?.confirm ? true : undefined}
          aria-describedby={state.fields?.confirm ? "confirm-error" : undefined}
          className="focus-visible:ring-ring h-11 focus-visible:ring-2"
        />
        {state.fields?.confirm && (
          <p id="confirm-error" role="alert" className="text-destructive">
            {state.fields.confirm}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" size="md" className="h-11" aria-disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
