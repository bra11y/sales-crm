import { cvFor } from "@/lib/apply/outbox";
import { userFromToken } from "@/lib/apply/kit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return new Response("Database not configured", { status: 500 });
  const userId = await userFromToken(admin, request.headers.get("authorization"));
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const job = new URL(request.url).searchParams.get("job") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(job)) return new Response("Not found", { status: 404 });
  const cv = await cvFor(admin, userId, job);
  if (!cv) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(cv.pdf), { headers: { "content-type": "application/pdf", "cache-control": "no-store" } });
}
