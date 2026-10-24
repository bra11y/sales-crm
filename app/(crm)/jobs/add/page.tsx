import type { Metadata } from "next";
import CaptureForm from "@/components/jobs/capture-form";
import InstallApp from "@/components/jobs/install-app";
import { Page, PageHead } from "@/components/workspace/parts";

export const metadata: Metadata = { title: "Add a job · Sales CRM", robots: { index: false } };

type Params = { shared?: string; missed?: string; text?: string; link?: string };

export default async function AddJobPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const one = (v: unknown) => (typeof v === "string" ? v.slice(0, 4000) : "");
  return (
    <Page>
      <PageHead
        title="Add a job"
        intro="Saw a job on your phone, in a WhatsApp group or on a site the CRM does not search? Add a screenshot. The CRM reads it, scores it against your Profile and saves it, ready to apply."
      />
      <CaptureForm shared={p.shared === "1"} missed={p.missed === "1"} startText={one(p.text)} startLink={one(p.link)} />
      <InstallApp />
    </Page>
  );
}
