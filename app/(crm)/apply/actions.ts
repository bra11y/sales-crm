"use server";

import { type ApplicationInput, buildApplicationEvent } from "@/lib/crm/application-event";
import { applyEvent } from "@/lib/crm/apply";
import { supabaseCrmDb } from "@/lib/crm/supabase-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveApplication(
  input: ApplicationInput & { jobId?: string },
): Promise<{ ok: true; companyName: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: owner } = await supabase.rpc("is_owner", { ws: 1 });
  if (!owner) return { ok: false, error: "Only the workspace owner can save applications." };

  const built = buildApplicationEvent(input);
  if (!built.ok) return built;

  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "The CRM database is not configured." };

  const result = await applyEvent(built.event, supabaseCrmDb(admin));
  if (result.status === "duplicate") return { ok: false, error: "This application was already saved." };
  if (result.status !== "applied") return { ok: false, error: "The application could not be saved. Try again." };
  if (input.jobId) {
    await supabase.from("job_posts").update({ status: "applied", status_changed_at: new Date().toISOString() }).eq("id", input.jobId);
  }
  return { ok: true, companyName: built.event.data.account.name };
}
