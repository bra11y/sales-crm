// A short, plain cold email that names real problems found on the company's own site.
// It goes to your Gmail Drafts: you read it, and you send it yourself.

import type { Finding } from "./check.ts";

export type Person = { name: string; brand?: string; portfolio?: string; cpacc?: string };

export function pitch(company: string, site: string, findings: Finding[], me: Person, contactName = ""): { subject: string; body: string } {
  const host = site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
  const top = findings.slice(0, 3);
  const lines = top.map((f) => `- ${f.title}. ${f.detail}`);
  const hello = contactName ? `Hi ${contactName.split(/\s+/)[0]},` : `Hi ${company} team,`;
  const body = [
    hello,
    "",
    `I ran a quick accessibility check on ${host} and found ${top.length === 1 ? "one thing that stops" : `${top.length} things that stop`} some customers from using it:`,
    "",
    ...lines,
    "",
    `${top.length === 1 ? "It's a quick fix, and it also lowers" : "These are quick fixes, and they also lower"} your legal risk under the ADA and the European Accessibility Act.`,
    "",
    `I'm a ${me.cpacc ? "CPACC-certified " : ""}accessibility engineer. I can do a full audit with a fix list for each page, ranked by what blocks a sale first. Would a 15-minute call next week help?`,
    "",
    ...(me.portfolio ? [`My work: ${me.portfolio}`, ""] : []),
    "Best,",
    me.brand ? `${me.name} (${me.brand})` : me.name,
    "",
    "If this isn't useful, reply \"no\" and I won't write again.",
  ];
  return { subject: `${top.length} accessibility issue${top.length === 1 ? "" : "s"} on ${host}`, body: body.join("\n") };
}
