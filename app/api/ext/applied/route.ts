import { markApplied } from "@/lib/apply/outbox";
import { userFromToken } from "@/lib/apply/kit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Database not configured" }, { status: 500 });
  const userId = await userFromToken(admin, request.headers.get("authorization"));
  if (!userId) return Response.json({ error: "The connection code is wrong or was revoked." }, { status: 401 });
  const { job, url, filled, auto } = (await request.json().catch(() => ({}))) as { job?: string; url?: string; filled?: number; auto?: boolean };
  if (!job || !/^[0-9a-f-]{36}$/i.test(job)) return Response.json({ error: "Unknown job." }, { status: 400 });
  let page = "";
  try {
    const u = new URL(String(url ?? ""));
    if (u.protocol === "https:") page = `${u.origin}${u.pathname}`.slice(0, 500);
  } catch {
    // no page given
  }
  const host = page ? new URL(page).hostname.replace(/^www\./, "") : "their site";
  const boxes = Math.max(0, Math.min(500, Math.round(Number(filled) || 0)));
  const r = await markApplied(admin, userId, job, {
    via: "form",
    kind: auto ? "submitted_form" : "marked_applied",
    title: auto ? `Submitted on ${host}` : `You marked it as sent on ${host}`,
    detail: auto
      ? `The extension filled ${boxes} ${boxes === 1 ? "box" : "boxes"}, you pressed Submit, and ${host} showed its thank-you page.`
      : `You pressed "mark as applied" in the extension on ${host}. Their confirmation email shows here when it arrives.`,
    evidence: page ? { page } : {},
  });
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 404 });
}
