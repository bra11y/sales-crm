import type { Metadata } from "next";
import ProfileDoc from "@/components/profile/profile-doc";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SOURCES } from "@/lib/jobs/sources";

export const metadata: Metadata = { title: "Profile · Sales CRM", robots: { index: false } };

export default async function ProfilePage() {
  const profile = await loadProfile();
  const supabase = await createSupabaseServerClient();
  const { data: mail } = profile ? await supabase.from("mail_accounts").select("email, test_sent_at").eq("user_id", profile.userId).maybeSingle() : { data: null };
  const sources = Object.entries(SOURCES).map(([id, s]) => ({ id, name: s.name }));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[52em] flex-col gap-8 px-4 py-10 md:px-8">
        {profile ? (
          <ProfileDoc facts={profile.stored} preferences={profile.preferences} updatedAt={profile.updatedAt} sources={sources} mail={mail ?? null} aiProvider={aiProvider()} />
        ) : (
          <>
            <h1 className="text-[28px] leading-[1.1] font-semibold tracking-[-0.02em]">Profile</h1>
            <p role="alert" className="text-danger">
              Your profile could not be loaded. Sign out, sign in again, then reopen this page.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Says which AI the app will use, without showing any key.
function aiProvider() {
  const free = process.env.FREE_AI_BASE_URL && process.env.FREE_AI_API_KEY && process.env.FREE_AI_MODEL;
  const host = free ? new URL(process.env.FREE_AI_BASE_URL!).hostname.replace(/^api\./, "") : "";
  const gateway = "Vercel AI Gateway, about 0.03 US cents a letter, inside the free $5 a month";
  if (free) return `Uses ${process.env.FREE_AI_MODEL} on ${host} for free first, then ${gateway}`;
  return `Uses ${gateway}`;
}
