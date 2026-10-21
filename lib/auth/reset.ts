export type PasswordErrors = { password?: string; confirm?: string };

export function checkNewPassword(password: string, confirm: string): PasswordErrors {
  if (!password) return { password: "New password: enter at least 12 characters." };
  if (password.length < 12) return { password: `New password: use at least 12 characters. You have ${password.length}.` };
  if (password !== confirm) return { confirm: "Confirm password: this does not match the new password." };
  return {};
}

export function safeNext(next: string | null | undefined): string {
  const n = String(next ?? "");
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}
