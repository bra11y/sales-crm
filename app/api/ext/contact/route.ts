import { userFromToken } from "@/lib/apply/kit";
import { acceptPageContact } from "@/lib/apply/page-contact";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// The extension found the employer's email on a job page that takes applications by email.
export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Database not configured" }, { status: 500 });
  const userId = await userFromToken(admin, request.headers.get("authorization"));
  if (!userId) return Response.json({ error: "The connection code is wrong or was revoked." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { job?: string; email?: string; sentence?: string; url?: string };
  if (!body.job || !/^[0-9a-f-]{36}$/i.test(body.job)) return Response.json({ error: "Unknown job." }, { status: 400 });

  const { data: job } = await admin.from("job_posts").select("id, url, apply_url, contact_email").eq("id", body.job).eq("user_id", userId).maybeSingle();
  if (!job) return Response.json({ error: "That job was not found." }, { status: 404 });
  const r = acceptPageContact(body, job);
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });

  const { error } = await admin.from("job_posts").update({ contact_email: r.contact.email, contact_source: r.contact.sentence }).eq("id", job.id).eq("user_id", userId);
  if (error) return Response.json({ error: "The address could not be saved. Try again." }, { status: 500 });
  return Response.json({ ok: true, email: r.contact.email, crm: `/jobs?open=${job.id}` });
}
