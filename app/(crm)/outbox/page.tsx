import type { Metadata } from "next";
import OutboxView, { type OutItem, type ReplyItem } from "@/components/jobs/outbox-view";
import { currentUserId } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Outbox · Sales CRM", robots: { index: false } };

export default async function OutboxPage() {
  const supabase = await createSupabaseServerClient();
  const userId = await currentUserId();
  const [out, replies, account] = await Promise.all([
    supabase
      .from("applications_outbox")
      .select("id, job_id, parent_id, kind, to_email, subject, body, status, send_after, sent_at, error, ai_note, job_posts(title, company)")
      .eq("user_id", userId)
      .neq("kind", "test")
      .order("created_at", { ascending: false })
      .limit(400),
    supabase.from("application_replies").select("id, job_id, outbox_id, from_email, subject, received_at, snippet, suggested_stage, confirmed").eq("user_id", userId).order("received_at", { ascending: false }).limit(200),
    supabase.from("mail_accounts").select("email, last_checked_at").eq("user_id", userId).maybeSingle(),
  ]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[44em] flex-col gap-8 px-4 py-8 md:px-8">
        <OutboxView
          items={(out.data ?? []) as unknown as OutItem[]}
          replies={(replies.data ?? []) as ReplyItem[]}
          account={account.data ?? null}
          loadError={Boolean(out.error || replies.error)}
        />
      </div>
    </div>
  );
}
