"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { aiProviders } from "@/lib/apply/ai";
import { refreshMarket } from "@/lib/market/market";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Reads today's figures now, when the morning run has not happened yet. Any signed-in person may.
export async function refreshMarketNow(): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return { ok: false, error: "You are signed out. Sign in again, then try once more." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "The database is not set up for this yet." };
  const r = await refreshMarket(admin, aiProviders(process.env, (await headers()).get("x-vercel-oidc-token")));
  revalidatePath("/market");
  return r.ok ? { ok: true } : { ok: false, error: `Markets could not be saved: ${r.errors.join("; ")}` };
}
