import { markApplied } from "@/lib/apply/outbox";
import { userFromToken } from "@/lib/apply/kit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Database not configured" }, { status: 500 });
  const userId = await userFromToken(admin, request.headers.get("authorization"));
  if (!userId) return Response.json({ error: "The connection code is wrong or was revoked." }, { status: 401 });
  const { job } = (await request.json().catch(() => ({}))) as { job?: string };
  if (!job || !/^[0-9a-f-]{36}$/i.test(job)) return Response.json({ error: "Unknown job." }, { status: 400 });
  const r = await markApplied(admin, userId, job);
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 404 });
}
