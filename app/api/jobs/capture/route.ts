import { headers } from "next/headers";
import { aiProviders } from "@/lib/apply/ai";
import { readCapture } from "@/lib/jobs/capture";
import { scoreJob } from "@/lib/jobs/fit";
import { currentUserId, loadProfile } from "@/lib/jobs/profile";
import { toRow } from "@/lib/jobs/run";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// A job you saw elsewhere (phone screenshot, pasted post or link) goes on your board as Saved.
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const PER_HOUR = 30;
const IMAGE = /^image\/(png|jpeg|webp|gif)$/;

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in again to add a job." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "The CRM database is not configured." }, { status: 500 });

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Nothing was sent. Add a screenshot or paste the post." }, { status: 400 });
  const shot = form.get("shot");
  const text = String(form.get("text") ?? "").slice(0, 20_000);
  const link = String(form.get("link") ?? "").slice(0, 1000);
  let image: string | undefined;
  if (shot instanceof File && shot.size > 0) {
    if (!IMAGE.test(shot.type)) return Response.json({ error: "Use a PNG, JPG or WebP screenshot. iPhone HEIC photos: take a screenshot instead." }, { status: 400 });
    if (shot.size > MAX_BYTES) return Response.json({ error: "That image is over 4 MB. Crop it to the job post and try again." }, { status: 400 });
    image = `data:${shot.type};base64,${Buffer.from(await shot.arrayBuffer()).toString("base64")}`;
  }

  // Each read costs a fraction of a cent; the cap stops a loop from running up a bill.
  const { count } = await admin
    .from("job_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "capture")
    .gte("first_seen_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= PER_HOUR) return Response.json({ error: `You added ${PER_HOUR} jobs this hour. Try again later.` }, { status: 429 });

  const profile = await loadProfile(admin, userId);
  if (!profile) return Response.json({ error: "Your profile could not be loaded." }, { status: 500 });
  if (profile.preferences.ai === "off") return Response.json({ error: "AI is off in Profile, so screenshots cannot be read. Turn it on, or paste the post's text and link." }, { status: 400 });

  let providers = aiProviders(process.env, (await headers()).get("x-vercel-oidc-token"));
  // Text-only free models cannot see images: use the free vision model if one is set, else skip it.
  if (image) providers = providers.flatMap((p) => (p.name !== "free" ? [p] : process.env.FREE_AI_VISION_MODEL ? [{ ...p, model: process.env.FREE_AI_VISION_MODEL }] : []));

  const r = await readCapture({ image, text, link }, providers);
  if (!r.ok) return Response.json({ error: r.error }, { status: 422 });

  // Already on the board (from a search, an alert or an earlier screenshot)? Open that one.
  const { data: same } = await admin
    .from("job_posts")
    .select("id, title, company, status, url")
    .eq("user_id", userId)
    .ilike("title", r.post.title.replace(/[%_\\]/g, "\\$&"))
    .limit(20);
  const twin = (same ?? []).find((j) => (j.company ?? "").toLowerCase().trim() === r.post.company.toLowerCase().trim());
  if (twin) {
    // A later share with the real link replaces the web-search stand-in.
    if (twin.url.startsWith("https://www.google.com/search") && !r.post.url.startsWith("https://www.google.com/search"))
      await admin.from("job_posts").update({ url: r.post.url, apply_url: r.post.applyUrl }).eq("id", twin.id);
    return Response.json({ ok: true, id: twin.id, duplicate: true, read: r.read });
  }

  const now = new Date();
  const fit = scoreJob(r.post, profile.facts, profile.preferences, now);
  const row = { ...toRow(r.post, fit, userId, now), hidden_reason: null, status: "saved", status_changed_at: now.toISOString() };
  const { data, error } = await admin.from("job_posts").upsert(row, { onConflict: "user_id,source,external_id" }).select("id").single();
  if (error || !data) return Response.json({ error: "The job was read but could not be saved. Try again." }, { status: 500 });
  return Response.json({ ok: true, id: data.id, duplicate: false, read: r.read, warning: fit.hidden, provider: r.provider });
}
