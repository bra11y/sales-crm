"use client";

import Link from "next/link";
import { useDeferredValue, useId, useState } from "react";
import { cn } from "@/lib/utils";

export type Person = { id: string; name: string; email: string | null; phone: string | null; company: string; companyId: string | null; group: string; note: string };

export default function ContactsList({ people, loadError }: { people: Person[]; loadError: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [copied, setCopied] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const groups = [...new Set(people.map((p) => p.group))].sort();
  const shown = people.filter((p) => (!group || p.group === group) && (!q || `${p.name} ${p.email ?? ""} ${p.phone ?? ""} ${p.company}`.toLowerCase().includes(q)));

  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(`Copied ${email}.`);
    } catch {
      setCopied("Your browser blocked copying. Select the address and copy it.");
    }
  }

  if (loadError) return <p role="alert" className="text-danger">The contacts could not be loaded. Reload the page.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[14em] flex-1 flex-col gap-1">
          <label htmlFor={`${id}-q`} className="text-soft text-[14px]">Search</label>
          <input id={`${id}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email, phone or company" className="border-line-strong bg-secondary focus-visible:ring-ring h-11 rounded-xl border px-3 text-[14px] outline-none focus-visible:ring-2" />
        </div>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {["", ...groups].map((g) => (
            <button
              key={g || "all"}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className={cn("focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] outline-none focus-visible:ring-2", group === g ? "bg-foreground text-background" : "bg-white/[0.06] hover:bg-white/[0.1]")}
            >
              {g || "Everyone"} <span className={cn("tabular-nums", group === g ? "opacity-70" : "text-soft")}>{g ? people.filter((p) => p.group === g).length : people.length}</span>
            </button>
          ))}
        </div>
      </div>
      <p role="status" aria-live="polite" className="text-soft text-[14px]">
        {copied || `${shown.length} ${shown.length === 1 ? "person" : "people"}`}
      </p>
      {shown.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white/[0.04]">
          <table className="w-full min-w-[40em] text-[14px]">
            <caption className="sr-only">Contacts</caption>
            <thead>
              <tr className="text-soft text-left text-[13px]">
                <th scope="col" className="px-4 py-2.5 font-normal">Name</th>
                <th scope="col" className="py-2.5 font-normal">Company</th>
                <th scope="col" className="py-2.5 font-normal">Email</th>
                <th scope="col" className="py-2.5 font-normal">Phone</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {shown.slice(0, 500).map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">{p.name}</th>
                  <td className="py-2.5">
                    {p.companyId ? <Link href={`/?company=${p.companyId}`} className="underline underline-offset-2">{p.company}</Link> : p.company}
                    <span className="text-soft block text-[13px]">{p.group}</span>
                  </td>
                  <td className="py-2.5">
                    {p.email ? (
                      <span className="flex items-center gap-1">
                        <a href={`mailto:${p.email}`} className="underline underline-offset-2">{p.email}</a>
                        <button type="button" onClick={() => copy(p.email!)} className="text-soft hover:text-foreground focus-visible:ring-ring min-h-8 rounded px-2 text-[13px] outline-none focus-visible:ring-2">
                          Copy<span className="sr-only"> {p.email}</span>
                        </button>
                      </span>
                    ) : <span className="text-soft">—</span>}
                  </td>
                  <td className="py-2.5">{p.phone ? <a href={`tel:${p.phone}`} className="underline underline-offset-2">{p.phone}</a> : <span className="text-soft">—</span>}</td>
                  <td className="text-soft px-4 py-2.5 text-[13px]">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-soft rounded-2xl bg-white/[0.04] px-4 py-3.5">{people.length ? "No one matches. Clear the search." : "No contacts yet. They arrive when people sign up in your apps, or when a job post lists an email."}</p>
      )}
    </div>
  );
}
