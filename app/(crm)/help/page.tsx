import type { Metadata } from "next";
import Link from "next/link";
import { LINK, Page, PageHead } from "@/components/workspace/parts";

export const metadata: Metadata = { title: "Help · Sales CRM", robots: { index: false } };

const PAGES = [
  { href: "/", name: "Companies", what: "Every customer and job application in one table. Click a row to open its record: properties, transaction history, timeline, notes and people." },
  {
    href: "/deals",
    name: "Deals board",
    what: "The same companies as cards, one column per stage. Move job applications and direct sales by dragging or with “Move to”. App pipelines follow their billing.",
  },
  { href: "/forecast", name: "Forecast", what: "Recurring revenue, what to expect next month, renewals due and the pipeline weighted by win chance." },
  { href: "/activity", name: "Activity", what: "The full history: payments in and failed, plan changes, stage moves, applications, emails, replies and notes. Filter, search and download a CSV." },
  { href: "/contacts", name: "Contacts", what: "People from your apps' sign-ups, and employer addresses from job posts." },
  { href: "/goals", name: "Goals", what: "Weekly, monthly or quarterly targets that count themselves, with a pace line and your recent streak." },
  { href: "/jobs", name: "Jobs", what: "Jobs found for you each morning, scored against your Profile." },
  { href: "/outbox", name: "Outbox", what: "Applications and follow-ups waiting to send, sent, and replies." },
  { href: "/payments", name: "Payments", what: "Every payment, with monthly totals and a CSV download." },
];

const KEYS = [
  ["⌘ K or Ctrl K", "Search companies (on the Companies page)"],
  ["Tab and Shift Tab", "Move between links, buttons and fields"],
  ["Esc", "Close a panel or search"],
  ["Enter or Space", "Open, press or pick the focused item"],
];

export default function HelpPage() {
  return (
    <Page>
      <PageHead title="Help" intro="What each page is for, where the numbers come from, and the keys that work everywhere." />
      <section aria-labelledby="pages" className="flex flex-col gap-2">
        <h2 id="pages" className="px-4 text-[17px] font-semibold">
          Pages
        </h2>
        <dl className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.04]">
          {PAGES.map((p) => (
            <div key={p.href} className="flex flex-col gap-0.5 px-4 py-3.5">
              <dt>
                <Link href={p.href} className={`${LINK} font-medium`}>
                  {p.name}
                </Link>
              </dt>
              <dd className="text-soft leading-normal">{p.what}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="numbers" className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] px-5 py-5">
        <h2 id="numbers" className="text-[17px] font-semibold">
          Where the numbers come from
        </h2>
        <ul className="text-soft flex list-disc flex-col gap-1.5 pl-5 leading-normal">
          <li>
            Your apps send signed events (sign-ups, plan changes, payments) to the CRM. See{" "}
            <Link href="/integrations" className={LINK}>
              Integrations
            </Link>
            .
          </li>
          <li>Money in different currencies is never added together. Each figure names its currency.</li>
          <li>Weighted value is the deal value times its win chance.</li>
          <li>A company is “slipping” when it is still open and nothing has been logged for 14 days.</li>
          <li>Job applications are recorded when an email sends, or when you mark a form as sent.</li>
        </ul>
      </section>
      <section aria-labelledby="keys" className="flex flex-col gap-2">
        <h2 id="keys" className="px-4 text-[17px] font-semibold">
          Keys
        </h2>
        <table className="w-full overflow-hidden rounded-2xl bg-white/[0.04] text-[14px]">
          <caption className="sr-only">Keyboard keys</caption>
          <tbody className="divide-y divide-white/[0.08]">
            {KEYS.map(([k, v]) => (
              <tr key={k}>
                <th scope="row" className="w-[12em] px-4 py-3 text-left font-medium">
                  <kbd className="font-sans">{k}</kbd>
                </th>
                <td className="text-soft px-4 py-3">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-soft px-4">Setup steps for Gmail, the Chrome extension and free AI are in the project at docs/guides/apply-setup.md.</p>
    </Page>
  );
}
