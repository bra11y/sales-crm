import type { Metadata } from "next";
import ContactsList, { type Person } from "@/components/workspace/contacts-list";
import { Page, PageHead } from "@/components/workspace/parts";
import { currentUserId } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contacts · Sales CRM", robots: { index: false } };

export default async function ContactsPage() {
  const supabase = await createSupabaseServerClient();
  const userId = await currentUserId();
  const [contacts, jobs, products] = await Promise.all([
    supabase.from("contacts").select("id, name, email, phone, created_at, company_id, companies(name, product)").eq("workspace_id", 1).order("name").limit(2000),
    userId
      ? supabase.from("job_posts").select("id, title, company, contact_email, contact_source, status").eq("user_id", userId).not("contact_email", "is", null).limit(500)
      : Promise.resolve({ data: [] }),
    supabase.from("products").select("slug, name"),
  ]);
  const names = Object.fromEntries((products.data ?? []).map((p) => [p.slug, p.name]));

  type C = { id: string; name: string; email: string | null; phone: string | null; created_at: string; company_id: string; companies: { name: string; product: string } | null };
  const people: Person[] = [
    ...((contacts.data ?? []) as unknown as C[]).map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.companies?.name ?? "",
      companyId: c.company_id,
      group: names[c.companies?.product ?? ""] ?? "Customers",
      note: `Added ${new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
    })),
    ...((jobs.data ?? []) as { id: string; title: string; company: string; contact_email: string; contact_source: string | null; status: string }[]).map((j) => ({
      id: `job-${j.id}`,
      name: j.contact_email.split("@")[0],
      email: j.contact_email,
      phone: null,
      company: j.company,
      companyId: null,
      group: "Employers",
      note: `${j.title} · ${j.status.replace("_", " ")}`,
    })),
  ];

  return (
    <Page>
      <PageHead
        title="Contacts"
        intro="People at your customers, from each app's sign-up events, and the employer addresses found in job posts you applied to."
      />
      <ContactsList people={people} loadError={Boolean(contacts.error)} />
    </Page>
  );
}
