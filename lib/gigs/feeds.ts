// Short-term work that people post in public, where you answer the person, not a job board:
// Hacker News "Who is hiring?" posts marked contract, freelance or part-time, the
// "Seeking freelancer" posts in its monthly freelancer thread, and Mastodon #hiring posts.
// Both allow reading: the Hacker News search API and Mastodon's public tag timelines.
// Reddit's robots.txt blocks all bots and the X API is paid, so neither is read.

import { decodeEntities, htmlToText } from "../jobs/text.ts";

export type Gig = {
  id: string;
  source: "hn" | "mastodon";
  url: string;
  author: string;
  title: string;
  text: string;
  postedAt: string;
  email: string | null;
  link: string | null;
  kind: string;
};

export const GIG_SOURCE: Record<Gig["source"], string> = { hn: "Hacker News", mastodon: "Mastodon" };

const SHORT_TERM = /\b(contract(or)?|freelance(r)?|part[- ]time|short[- ]term|project[- ]based|consult(ant|ing)|fractional|retainer|hourly)\b/i;
const HIRING = /\b(we.?re hiring|we are hiring|now hiring|is hiring|are hiring|looking for an? |seeking an? |hiring an? |we need an? |need help with)\b/i;
const NOT_HIRING = /#?opentowork|hire me|\bi need a job\b|i.?m looking for (work|a job|a new role)|looking for work|seeking work|available for (work|hire)/i;

// Posters often edit the first line once the role is gone.
const CLOSED = /\b(closed|filled|no longer (hiring|open|accepting))\b/i;

const kindOf = (t: string) => (t.match(SHORT_TERM)?.[0] ?? "contract").toLowerCase().replace(/\s+/g, "-");

// An email written plainly or as "name [at] site [dot] com".
export function emailIn(text: string): string | null {
  const plain = text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0];
  if (plain) return plain.replace(/[.,;:]+$/, "");
  const m = text.match(/([\w.+-]+)\s*[[(<{]\s*at\s*[\])>}]\s*([\w-]+(?:\s*[[(<{]\s*dot\s*[\])>}]\s*[\w-]+)+)/i);
  return m ? `${m[1]}@${m[2].replace(/\s*[[(<{]\s*dot\s*[\])>}]\s*/gi, ".")}` : null;
}

// Each <p> starts a new line, so the first line is the post's heading.
const paragraphs = (html: string) => htmlToText(html.replace(/<p>/gi, "\n<p>").replace(/<br\s*\/?>/gi, "\n")).trim();

const firstLink = (html: string) =>
  [...html.matchAll(/href="([^"]+)"/g)].map((m) => decodeEntities(m[1])).find((u) => /^https:\/\//.test(u) && !/news\.ycombinator\.com|mastodon\.social\/tags/.test(u)) ?? null;

type HnItem = { id: number; author?: string; text?: string | null; created_at: string; children?: HnItem[] };

// Top-level comments of "Who is hiring?" that are short-term work, or "SEEKING FREELANCER" posts.
export function gigsFromHn(thread: HnItem, freelancerThread = false): Gig[] {
  return (thread.children ?? [])
    .filter((c) => c.text && c.author)
    .map((c) => ({ c, text: paragraphs(c.text!) }))
    .filter(({ text }) => (freelancerThread ? /^\s*seeking freelancer/i.test(text) : SHORT_TERM.test(text.split("\n")[0])) && !CLOSED.test(text.split("\n")[0]))
    .map(({ c, text }) => ({
      id: `hn-${c.id}`,
      source: "hn" as const,
      url: `https://news.ycombinator.com/item?id=${c.id}`,
      author: c.author!,
      title: text.split("\n")[0].replace(/^\s*seeking freelancer\s*[:|-]?\s*/i, "").slice(0, 140) || "Seeking a freelancer",
      text: text.slice(0, 4000),
      postedAt: c.created_at,
      email: emailIn(text),
      link: firstLink(c.text!),
      kind: freelancerThread ? "freelance" : kindOf(text.split("\n")[0]),
    }));
}

type Toot = { id: string; url: string; created_at: string; content: string; account: { acct: string; display_name?: string; bot?: boolean } };

// Mastodon posts from people or teams who need short-term help: not job-board bots
// re-posting full-time jobs, and not people looking for work.
export function gigsFromMastodon(posts: Toot[]): Gig[] {
  return posts
    .map((p) => ({ p, text: paragraphs(p.content) }))
    .filter(({ p, text }) => !p.account.bot && HIRING.test(text) && SHORT_TERM.test(text) && !NOT_HIRING.test(text))
    .map(({ p, text }) => ({
      id: `mastodon-${p.id}`,
      source: "mastodon" as const,
      url: p.url,
      author: p.account.display_name || p.account.acct,
      title: text.split(/(?<=[.!?])\s|\n/)[0].slice(0, 160),
      text: text.slice(0, 3000),
      postedAt: p.created_at,
      email: emailIn(text),
      link: firstLink(p.content),
      kind: kindOf(text),
    }));
}

// The newest thread of a kind from the Hacker News search API.
// "Who is hiring?" is posted by the whoishiring account; the freelancer thread by a regular member.
export const HN_SEARCH = (query: string, author?: string) =>
  `https://hn.algolia.com/api/v1/search_by_date?tags=story${author ? `,author_${author}` : ""}&query=${encodeURIComponent(query)}&hitsPerPage=10`;
export const HN_ITEM = (id: string | number) => `https://hn.algolia.com/api/v1/items/${id}`;
export const MASTODON_TAGS = ["hiring", "getfedihired", "fedihire", "freelance", "a11yjobs"];
export const MASTODON_TAG = (tag: string) => `https://mastodon.social/api/v1/timelines/tag/${tag}?limit=40`;
