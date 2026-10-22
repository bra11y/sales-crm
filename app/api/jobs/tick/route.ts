import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/apply/outbox";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Runs every hour from GitHub Actions: checks replies, sends due applications and follow-ups.
// Safe to run twice: a sent row is never picked up again.
export const maxDuration = 300;

function authorized(header: string | null) {
  const secrets = [process.env.AUTOMATION_SECRET, process.env.CRON_SECRET].filter(Boolean) as string[];
  if (!header) return false;
  const a = Buffer.from(header);
  return secrets.some((s) => {
    const b = Buffer.from(`Bearer ${s}`);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

async function run(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Database not configured" }, { status: 500 });
  const report = await tick(admin, Date.now() + 240_000);
  return Response.json({ users: report.length, report });
}

export const GET = run;
export const POST = run;
