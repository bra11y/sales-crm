import Companies from "@/components/companies/companies";
import CompaniesData from "@/components/companies/companies-data";
import { UNASSIGNED, type Owner, type ProductProfile } from "@/data/companies";
import type { Notification } from "@/data/notifications";
import { type CompanyListRow, toCompany } from "@/lib/crm/to-company";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProfileRow = {
  user_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
};

type RecentRow = { id: number; kind: string; summary: string; at: string; company_id: string; companies: { name: string } | null };

function ago(iso: string, now: Date) {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m || 1}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

// The latest things worth knowing, from the real activity log.
function toNotification(a: RecentRow, now: Date): Notification {
  const kind = a.kind === "payment.failed" ? "alert" : a.kind === "stage.changed" ? "stage" : "update";
  return { id: String(a.id), kind, companyId: a.company_id, message: a.summary, time: ago(a.at, now), at: a.at, unread: false };
}

function toOwner(p: ProfileRow): Owner {
  return { name: p.name, role: p.title ?? "", email: p.email ?? "", phone: p.phone ?? "", avatar: p.avatar_url ?? "" };
}

export default async function CompaniesPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: rows, error }, { data: products }, { data: profiles }, { data: claims }, { data: recent }] = await Promise.all([
    supabase.from("company_list").select("*").eq("workspace_id", 1),
    supabase.from("products").select("slug, name, stages, segments, tag_tones").order("name"),
    supabase.from("profiles").select("user_id, name, title, email, phone, avatar_url"),
    supabase.auth.getClaims(),
    supabase.from("activities").select("id, kind, summary, at, company_id, companies(name)").eq("workspace_id", 1).neq("kind", "note").order("at", { ascending: false }).limit(30),
  ]);
  if (error) throw new Error("The companies could not be loaded.");

  const now = new Date();
  const people = (profiles ?? []) as ProfileRow[];
  const owners = people.map(toOwner);
  const me = people.find((p) => p.user_id === claims?.claims?.sub);

  return (
    <CompaniesData
      companies={((rows ?? []) as CompanyListRow[]).map((row) => toCompany(row, now))}
      products={(products ?? []) as ProductProfile[]}
      owners={owners}
      currentUser={me ? toOwner(me) : (owners[0] ?? UNASSIGNED)}
      notifications={((recent ?? []) as unknown as RecentRow[]).map((a) => toNotification(a, now))}
    >
      <Companies />
    </CompaniesData>
  );
}
