import { scoreJob } from "@/lib/jobs/fit";
import { currentUserId, loadProfile } from "@/lib/jobs/profile";
import { toRow } from "@/lib/jobs/run";
import { type ChatPost, chatToJob } from "@/lib/import/whatsapp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Posts from an exported WhatsApp group. The page reads the chat on your device and sends only
// the posts (no names or numbers). Scholarships go to "Found in your chats"; jobs are scored
// like any other job, so only the ones that fit you show on your board.
export const maxDuration = 60;

const MAX = 3000;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function clean(raw: unknown): ChatPost | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const url = str(p.url, 1000);
  const title = str(p.title, 200).trim();
  if (!/^https?:\/\/\S+$/.test(url) || !title || (p.kind !== "job" && p.kind !== "scholarship")) return null;
  const list = (v: unknown, n: number, max: number) =>
    Array.isArray(v)
      ? v
          .filter((x) => typeof x === "string")
          .slice(0, n)
          .map((x: string) => x.slice(0, max))
      : [];
  return {
    kind: p.kind,
    title,
    url,
    where: str(p.where, 200),
    eligible: str(p.eligible, 200),
    level: str(p.level, 120),
    benefits: list(p.benefits, 6, 200),
    deadline: day(p.deadline),
    deadlineText: str(p.deadlineText, 80),
    sharedAt: day(p.sharedAt),
    needs: list(p.needs, 20, 40) as ChatPost["needs"],
    text: str(p.text, 4000),
  };
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in again to import." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "The CRM database is not configured." }, { status: 500 });
  const body = (await request.json().catch(() => null)) as { posts?: unknown[] } | null;
  const posts = (Array.isArray(body?.posts) ? body.posts.slice(0, MAX) : []).map(clean).filter((p): p is ChatPost => p !== null);
  if (!posts.length) return Response.json({ error: "No job or scholarship posts were found in that chat." }, { status: 400 });

  const leads = posts
    .filter((p) => p.kind === "scholarship")
    .map((p) => ({
      user_id: userId,
      title: p.title,
      url: p.url,
      place: p.where || null,
      eligible: p.eligible || null,
      level: p.level || null,
      benefits: p.benefits,
      needs: p.needs,
      deadline: p.deadline,
      deadline_text: p.deadlineText || null,
      shared_at: p.sharedAt,
      fully_funded: /fully[- ]funded|full scholarship|full tuition/i.test(`${p.title} ${p.benefits.join(" ")}`),
    }));
  let leadsAdded = 0;
  for (let i = 0; i < leads.length; i += 500) {
    const { data, error } = await admin
      .from("scholarship_leads")
      .upsert(leads.slice(i, i + 500), { onConflict: "user_id,url", ignoreDuplicates: true })
      .select("id");
    if (error) return Response.json({ error: "The scholarships could not be saved. Try again." }, { status: 500 });
    leadsAdded += data?.length ?? 0;
  }

  const profile = await loadProfile(admin, userId);
  const now = new Date();
  let jobsAdded = 0;
  let jobsFit = 0;
  const jobs = posts.filter((p) => p.kind === "job");
  if (profile && jobs.length) {
    const rows = jobs.map((p) => {
      const post = chatToJob(p);
      const fit = scoreJob(post, profile.facts, profile.preferences, now);
      return toRow(post, fit, userId, now);
    });
    for (let i = 0; i < rows.length; i += 500) {
      // Jobs already on your board keep their status and notes.
      const { data, error } = await admin
        .from("job_posts")
        .upsert(rows.slice(i, i + 500), { onConflict: "user_id,source,external_id", ignoreDuplicates: true })
        .select("id, hidden_reason");
      if (error) return Response.json({ error: "The jobs could not be saved. Try again." }, { status: 500 });
      jobsAdded += data?.length ?? 0;
      jobsFit += (data ?? []).filter((r) => !r.hidden_reason).length;
    }
  }

  return Response.json({ ok: true, scholarships: { found: leads.length, added: leadsAdded }, jobs: { found: jobs.length, added: jobsAdded, fit: jobsFit } });
}
