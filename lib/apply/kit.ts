import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOURCES, type SourceId } from "@/lib/jobs/sources";
import { prepare } from "./outbox";
import { jobKey } from "./page-key";
import { proofBlock, proofLine } from "./proof";

// What the Chrome extension needs to fill one application form.

export type Kit = {
  job: { id: string; title: string; company: string; applyUrl: string; matchedBy: "page" | "recent" | "chosen" };
  fields: Record<string, string>;
  answers: { question: string; words: string[]; answer: string }[];
  generated: Record<"why" | "proof" | "links" | "cover" | "hear" | "extra", string>;
  cvName: string;
};

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createExtensionToken(db: SupabaseClient, userId: string): Promise<string> {
  const token = `scx_${randomBytes(24).toString("base64url")}`;
  await db.from("extension_tokens").upsert({ user_id: userId, token_hash: hash(token), created_at: new Date().toISOString(), last_used_at: null });
  return token;
}

export async function userFromToken(db: SupabaseClient, header: string | null): Promise<string | null> {
  const token = header?.match(/^Bearer (scx_[A-Za-z0-9_-]{20,80})$/)?.[1];
  if (!token) return null;
  const { data } = await db.from("extension_tokens").select("user_id").eq("token_hash", hash(token)).maybeSingle();
  if (!data) return null;
  await db.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("user_id", data.user_id);
  return data.user_id as string;
}

async function findJob(db: SupabaseClient, userId: string, pageUrl: string, jobId?: string) {
  // The CRM's Apply button names the job, so there is nothing to guess.
  if (jobId) {
    const { data } = await db.from("job_posts").select("id").eq("user_id", userId).eq("id", jobId).maybeSingle();
    return data ? { id: data.id as string, matchedBy: "chosen" as const } : null;
  }
  const key = jobKey(pageUrl);
  if (key) {
    const { data } = await db.from("job_posts").select("id").eq("user_id", userId).or(`apply_url.ilike.%${key}%,url.ilike.%${key}%`).limit(1).maybeSingle();
    if (data) return { id: data.id as string, matchedBy: "page" as const };
  }
  // Otherwise: the last job you pressed Apply on in the CRM.
  const { data } = await db.from("job_posts").select("id").eq("user_id", userId).not("draft", "is", null).order("draft->>at", { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id as string, matchedBy: "recent" as const } : null;
}

export async function buildKit(db: SupabaseClient, userId: string, pageUrl: string, jobId?: string): Promise<{ ok: true; kit: Kit } | { ok: false; error: string }> {
  const found = await findJob(db, userId, pageUrl, jobId);
  if (!found) return { ok: false, error: "No job found. In the CRM, open the job and press Apply first." };
  const r = await prepare(db, userId, found.id);
  if (!r.ok) return r;
  const p = r.p;
  const { data: job } = await db.from("job_posts").select("title, company, source").eq("id", found.id).single();
  const { data: profile } = await db.from("job_profiles").select("facts").eq("user_id", userId).single();
  const facts = (profile?.facts ?? {}) as { answers?: Kit["answers"]; person?: Record<string, string> };
  const [first, ...rest] = p.person.name.split(" ");
  const [city, country] = p.person.location.split(",").map((x) => x.trim());
  const links = [...p.proof.filter((w) => w.url).map((w) => `${w.title}: ${w.url}`), p.person.portfolio && `Portfolio: ${p.person.portfolio}`, facts.person?.behance && `Behance: ${facts.person.behance}`].filter(Boolean) as string[];
  const best = p.proof[0];
  return {
    ok: true,
    kit: {
      job: { id: found.id, title: job?.title ?? "", company: job?.company ?? "", applyUrl: /^https?:\/\//.test(p.applyUrl) ? p.applyUrl : "", matchedBy: found.matchedBy },
      fields: {
        firstName: first ?? "", lastName: rest[rest.length - 1] ?? "", fullName: p.person.name, email: p.person.email, phone: p.person.phone,
        linkedin: p.person.linkedin, portfolio: p.person.portfolio, github: "", city: city ?? "", country: country ?? "", location: p.person.location,
      },
      answers: facts.answers ?? [],
      generated: {
        why: p.why.why,
        proof: best ? `${best.title}. ${best.what} ${best.result}${best.url ? ` You can see it here: ${best.url}` : ""}` : "",
        links: links.join("\n"),
        cover: p.body,
        hear: `I found the role on ${SOURCES[job?.source as SourceId]?.name ?? "a job board"}.`,
        extra: proofBlock(p.proof, p.person.portfolio) || p.proof.map(proofLine).join("\n"),
      },
      cvName: p.attachment,
    },
  };
}
