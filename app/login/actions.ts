"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; fields?: { email?: string; password?: string }; email?: string };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const fields: LoginState["fields"] = {};
  if (!email) fields.email = "Email: enter the email you use for the CRM.";
  if (!password) fields.password = "Password: enter your password.";
  if (fields.email || fields.password) return { fields, email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password do not match. Check both and try again.", email };
  redirect("/");
}
