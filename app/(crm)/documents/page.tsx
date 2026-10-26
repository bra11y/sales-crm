import type { Metadata } from "next";
import Documents from "@/components/grow/documents";
import { Page, PageHead } from "@/components/workspace/parts";
import { DOC_KINDS, type Doc, type DocKind } from "@/lib/grow/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documents · Sales CRM", robots: { index: false } };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const need = (await searchParams).need;
  const supabase = await createSupabaseServerClient();
  const [{ data: auth }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("documents").select("id, kind, title, path, mime, size_bytes, expires_on, note, created_at").order("created_at", { ascending: false }),
  ]);
  return (
    <Page>
      <PageHead title="Documents" intro="Your CV, transcript, certificates, passport and ID in one private place, ready to upload when a school, scholarship or job asks. Only you can open them." />
      {error && (
        <p role="alert" className="text-danger">
          Your documents could not be loaded. If this is new, the database update may not be live yet.
        </p>
      )}
      <Documents docs={(data ?? []) as Doc[]} userId={auth.user?.id ?? ""} need={DOC_KINDS.includes(need as DocKind) ? (need as DocKind) : null} now={new Date().toISOString()} />
    </Page>
  );
}
