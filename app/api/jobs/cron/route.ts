import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/apply/outbox";
import { searchJobs } from "@/lib/jobs/search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Database not configured" }, { status: 500 });

  const { data: users } = await admin.from("job_profiles").select("user_id");
  const results = [];
  for (const { user_id } of users ?? []) {
    const r = await searchJobs(admin, user_id, "schedule");
    results.push(r.ok ? { added: r.added, kept: r.kept, errors: r.errors } : { error: r.error });
  }
  // The daily run also sends and checks replies, in case the hourly GitHub tick is not set up.
  const mail = await tick(admin, Date.now() + 120_000);
  return Response.json({ users: results.length, results, mail });
}
