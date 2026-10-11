import Companies from "@/components/companies/companies";
import CompaniesData from "@/components/companies/companies-data";
import { UNASSIGNED, type Owner, type ProductProfile } from "@/data/companies";
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

function toOwner(p: ProfileRow): Owner {
  return { name: p.name, role: p.title ?? "", email: p.email ?? "", phone: p.phone ?? "", avatar: p.avatar_url ?? "" };
}

export default async function CompaniesPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: rows, error }, { data: products }, { data: profiles }, { data: claims }] = await Promise.all([
    supabase.from("company_list").select("*").eq("workspace_id", 1),
    supabase.from("products").select("slug, name, stages, segments, tag_tones").order("name"),
    supabase.from("profiles").select("user_id, name, title, email, phone, avatar_url"),
    supabase.auth.getClaims(),
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
    >
      <Companies />
    </CompaniesData>
  );
}
