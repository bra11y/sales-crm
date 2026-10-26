import { test } from "node:test";
import assert from "node:assert/strict";
import F from "../apply/facts.js";
import type { Facts } from "../jobs/facts.ts";
import { emailIn, gigsFromHn, gigsFromMastodon } from "./feeds.ts";
import { gigMatch, gigReply } from "./reply.ts";
import E from "../apply/engine.js";

const facts = F as unknown as Facts;
const thread = {
  id: 1,
  created_at: "2026-10-01T15:00:00Z",
  children: [
    { id: 2, author: "acme", created_at: "2026-10-02T10:00:00Z", text: "Acme | Front-end Engineer | REMOTE | Contract<p>We need React and WCAG help. Email jobs [at] acme [dot] io" },
    { id: 3, author: "big", created_at: "2026-10-02T10:00:00Z", text: "BigCo | Backend Engineer | ONSITE | Full-time<p>Go and Kafka." },
    { id: 4, author: "old", created_at: "2026-10-02T10:00:00Z", text: "OldCo | Designer | Contract | CLOSED NOW<p>Figma." },
  ],
};

test("Hacker News: only short-term, still-open posts, with obfuscated emails read", () => {
  const g = gigsFromHn(thread);
  assert.equal(g.length, 1);
  assert.equal(g[0].email, "jobs@acme.io");
  assert.equal(g[0].kind, "contract");
  assert.equal(g[0].url, "https://news.ycombinator.com/item?id=2");
});

test("Mastodon: people hiring are kept, people looking for work are not", () => {
  const toot = (id: string, content: string) => ({ id, url: `https://mastodon.social/@a/${id}`, created_at: "2026-10-20T00:00:00Z", content, account: { acct: "a", display_name: "Ada" } });
  const g = gigsFromMastodon([toot("1", "<p>We are hiring a freelance React developer for 3 months. hi@studio.ng</p>"), toot("2", "<p>I need a job! #OpenToWork React dev</p>")]);
  assert.deepEqual(
    g.map((x) => x.id),
    ["mastodon-1"],
  );
  assert.equal(g[0].email, "hi@studio.ng");
  assert.equal(emailIn("write to me at nobody"), null);
});

test("the reply names the post, uses true proofs only, and passes the slop check", () => {
  const [g] = gigsFromHn(thread);
  assert.ok(gigMatch(g, facts).includes("React"));
  const r = gigReply(g, facts);
  assert.equal(r.subject, "Re: Front-end Engineer (Acme)");
  assert.match(r.body, /^Hi,\n/);
  assert.match(r.body, /the Front-end Engineer work at Acme/);
  const lint = E.lint(r.body) as { id?: string; msg?: string }[] | { issues?: unknown[] };
  const issues = Array.isArray(lint) ? lint : (lint.issues ?? []);
  assert.equal(issues.length, 0, JSON.stringify(issues));
});
