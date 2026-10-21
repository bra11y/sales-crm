"use server";

import { redirect } from "next/navigation";
import { checkNewPassword, type PasswordErrors } from "@/lib/auth/reset";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NewPasswordState = { fields?: PasswordErrors; error?: string };

export async function setNewPassword(_prev: NewPasswordState, form: FormData): Promise<NewPasswordState> {
  const password = String(form.get("password") ?? "");
  const fields = checkNewPassword(password, String(form.get("confirm") ?? ""));
  if (fields.password || fields.confirm) return { fields };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your reset link has expired. Ask for a new one from the sign-in page." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: `The password was not changed: ${error.message}` };
  redirect("/jobs");
}
