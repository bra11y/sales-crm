import type { ApplicationData, CrmEvent, EventData } from "./events.ts";

export type ApplicationInput = {
  company: string;
  role: string;
  manager?: string;
  track: string;
  contract: boolean;
  documents: { cv?: string; cover?: string; proposal?: string };
  jd?: string;
  matched: string[];
  gaps: string[];
  value?: string;
  currency?: string;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const words = (list: string[]) => list.map((w) => String(w).slice(0, 80)).filter(Boolean).slice(0, 60);

export function buildApplicationEvent(
  input: ApplicationInput,
  now = new Date(),
): { ok: true; event: CrmEvent } | { ok: false; error: string } {
  const company = String(input.company ?? "").trim().slice(0, 200);
  const role = String(input.role ?? "").trim().slice(0, 200);
  if (!company) return { ok: false, error: "Add the company or client name first." };
  if (!role) return { ok: false, error: "Add the role or project name first." };

  const documents: ApplicationData["documents"] = {};
  for (const key of ["cv", "cover", "proposal"] as const) {
    const text = input.documents?.[key];
    if (text) documents[key] = text.slice(0, 60_000);
  }
  if (!Object.keys(documents).length) return { ok: false, error: "Make at least one document before saving." };

  const application: ApplicationData = {
    role,
    track: String(input.track || "Accessibility").slice(0, 40),
    documents,
    matched: words(input.matched ?? []),
    gaps: words(input.gaps ?? []),
  };
  if (input.jd) application.job_post = input.jd.slice(0, 40_000);
  const value = Number(input.value);
  if (Number.isFinite(value) && value > 0) {
    application.value_minor = Math.round(value * 100);
    application.currency = input.currency === "NGN" ? "NGN" : "USD";
  }

  const data: EventData = { account: { id: slug(company), name: company }, segment: input.contract ? "Contract" : "Job", application };
  if (input.manager?.trim()) data.contact = { name: input.manager.trim().slice(0, 200) };

  const at = now.toISOString();
  return {
    ok: true,
    event: { event_id: `applications:${slug(company)}:${at}`, product: "applications", type: "application.sent", occurred_at: at, data },
  };
}
