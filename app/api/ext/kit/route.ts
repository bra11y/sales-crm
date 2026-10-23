import { buildKit, userFromToken } from "@/lib/apply/kit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// The Chrome extension asks for the fill-in kit for the page it is on.
export const maxDuration = 60;

export async function GET(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "The CRM database is not configured." }, { status: 500 });
  const userId = await userFromToken(admin, request.headers.get("authorization"));
  if (!userId) return Response.json({ error: "The connection code is wrong or was revoked. Make a new one in Profile." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const page = params.get("url") ?? "";
  const job = params.get("job") ?? undefined;
  if (job && !/^[0-9a-f-]{36}$/i.test(job)) return Response.json({ error: "That job id is not valid." }, { status: 400 });
  const r = await buildKit(admin, userId, page.slice(0, 2000), job);
  return r.ok ? Response.json(r.kit, { headers: { "cache-control": "no-store" } }) : Response.json({ error: r.error }, { status: 404 });
}
