// A short reply to someone who posted work: name what they asked for, give one or two
// what you do in plain words, and offer one small first piece. It goes to your Gmail Drafts.

import E from "../apply/engine.js";
import type { Facts } from "../jobs/facts.ts";
import type { Gig } from "./feeds.ts";

type Analysis = { track: string; matched: { label: string; group: string }[] };

// The skills from your fact bank that the post asks for.
export function gigMatch(gig: Pick<Gig, "title" | "text">, facts: Facts): string[] {
  const a = E.analyze(`${gig.title}\n${gig.text}`, facts) as unknown as Analysis;
  return [...new Set(a.matched.filter((m) => m.group !== "Working style").map((m) => m.label))];
}

export function gigReply(gig: Gig, facts: Facts): { subject: string; body: string } {
  const skills = gigMatch(gig, facts);
  const p = facts.person;
  const first = gig.author.split(/[\s@]+/)[0];
  // Hacker News posts start "Company | Role | Place | ...".
  const [company, role0] = gig.title.split("|").map((x) => x.trim());
  const what = gig.source === "hn" && role0 ? `the ${role0} work at ${company}` : company;
  const subject = gig.source === "hn" && role0 ? `${role0} (${company})` : company;
  const body = [
    gig.source === "mastodon" && first && !/^\d/.test(first) ? `Hi ${first},` : "Hi,",
    "",
    `I saw your post on ${gig.source === "hn" ? "Hacker News" : "Mastodon"}${what ? ` about ${what}` : ""}. ${skills.length ? `It asks for ${skills.slice(0, 3).join(", ")}. That is my work.` : "It sounds like work I can help with."}`,
    "",
    "Unconventional as it may seem, let me start with one small piece of it, at a budget that works for you. Tell me the scope and when you need it, and I'll send a short plan within a day. I promise you'll smile back at this decision.",
    "",
    ...(p.portfolio ? [`My work: ${p.portfolio}`, ""] : []),
    "Best regards,",
    p.name || "",
  ];
  return { subject: subject ? `Re: ${subject}`.slice(0, 120) : "Re: your post", body: body.join("\n").trim() };
}
