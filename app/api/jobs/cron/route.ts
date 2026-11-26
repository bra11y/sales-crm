import { timingSafeEqual } from "node:crypto";
import { sendDigest, tick } from "@/lib/apply/outbox";
import { searchJobs } from "@/lib/jobs/search";
import { searchConferences } from "@/lib/conferences/search";
import { searchGrants } from "@/lib/grants/search";
import { searchScholarships } from "@/lib/scholarships/search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { aiProviders } from "@/lib/apply/ai";
import { refreshMarket } from "@/lib/market/market";

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

  // Markets first: one row for everyone, so the morning page is ready early.
  const market = await refreshMarket(admin, aiProviders(process.env, request.headers.get("x-vercel-oidc-token"))).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "failed" }));
  const { data: users } = await admin.from("job_profiles").select("user_id");
  const results = [];
  for (const { user_id } of users ?? []) {
    const r = await searchJobs(admin, user_id, "schedule");
    // Scholarships are searched in the same daily run, so they arrive like jobs do.
    const s = await searchScholarships(admin, user_id, "schedule");
    const g = await searchGrants(admin, user_id);
    const c = await searchConferences(admin, user_id);
    results.push({
      jobs: r.ok ? { added: r.added, kept: r.kept, errors: r.errors } : { error: r.error },
      scholarships: s.ok ? { added: s.added, errors: s.errors } : { error: s.error },
      grants: g.ok ? { added: g.added, errors: g.errors } : { error: g.error },
      conferences: c.ok ? { added: c.added, errors: c.errors } : { error: c.error },
    });
  }
  // The daily run also sends and checks replies, in case the hourly GitHub tick is not set up.
  const mail = await tick(admin, Date.now() + 120_000);
  // After the night's searches and sends: one email to each person listing what needs them.
  const digests = [];
  for (const { user_id } of users ?? []) digests.push(await sendDigest(admin, user_id, new Date()));
  return Response.json({ users: results.length, market, results, mail, digests });
}
