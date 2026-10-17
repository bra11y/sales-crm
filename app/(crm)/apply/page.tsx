import type { Metadata } from "next";
import ApplyForm from "@/components/apply/apply-form";
import PageShell from "@/components/sales/page-shell";

export const metadata: Metadata = { title: "Apply · Sales CRM", robots: { index: false } };

export default function ApplyPage() {
  return (
    <PageShell
      title="Apply"
      intro="Paste a job post or project brief. Get a CV, cover letter or proposal built only from your true facts, then save it here to track it from Applied to Won."
    >
      <ApplyForm />
    </PageShell>
  );
}
