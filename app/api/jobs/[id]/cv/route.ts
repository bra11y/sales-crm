import { cvFor } from "@/lib/apply/outbox";
import { currentUserId } from "@/lib/jobs/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// The tailored CV for one job, as the same PDF an email would attach.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const userId = await currentUserId();
  const admin = createSupabaseAdminClient();
  if (!userId || !admin) return new Response("Sign in again", { status: 401 });
  const cv = await cvFor(admin, userId, id);
  if (!cv) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(cv.pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${cv.name}"`, "cache-control": "private, no-store" },
  });
}
