// Hot Nigerian Jobs: Nigerian jobs, often entry level, many that take applications by email.
// Its robots.txt allows reading. The feed has a one-line summary, so the full post is read
// from the job page, but only for single-role posts in your fields.
import { decodeEntities, htmlToText } from "./text.ts";
import type { JobPost } from "./sources.ts";

const ROUNDUP = /\(\d+\s+positions?\)|job recruitment|\brecap\b|goody bag|\bhnj\b|massive|list of successful/i;

export function parseHnjFeed(body: string): JobPost[] {
  return [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const tag = (name: string) => decodeEntities(item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? "");
      const full = tag("title");
      const link = tag("link") || tag("guid");
      // "Digital Engagement Intern at ActionAid Nigeria (AAN)": the last " at " splits role and company.
      const at = full.lastIndexOf(" at ");
      const title = (at > 0 ? full.slice(0, at) : full).replace(/\s+-\s+\d+\s+openings?$/i, "").trim();
      const company =
        at > 0
          ? full
              .slice(at + 4)
              .replace(/\s+-\s+\d+\s+openings?$/i, "")
              .trim()
          : "";
      const date = new Date(tag("pubDate"));
      return {
        source: "hotnigerianjobs",
        externalId: link,
        title,
        company,
        companyLogo: null,
        url: link,
        applyUrl: link,
        description: htmlToText(tag("description")),
        location: "Nigeria",
        restrictions: ["Nigeria"],
        pay: null,
        employmentType: "",
        postedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
        tags: [],
        // Round-ups list many roles with no detail of their own, so they are skipped.
        keep: !ROUNDUP.test(full) && at > 0,
      };
    })
    .filter((p) => p.keep && p.url.startsWith("https://www.hotnigerianjobs.com/"))
    .map((p): JobPost => {
      const { keep, ...post } = p;
      void keep;
      return post;
    });
}

function withoutTracking(url: string) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

// The full post: its text, its place, and the employer's own apply link when there is one.
export function readHnjPage(html: string, post: JobPost): JobPost {
  const start = html.indexOf("</h1>");
  const end = html.indexOf("Share this job", start);
  if (start < 0 || end < 0) return post;
  const body = html.slice(start + 5, end);
  const text = htmlToText(body).slice(0, 20_000);
  const place = text.match(/Location:\s*\n*\s*([^\n]{2,80})/i)?.[1]?.trim() ?? "";
  const at = body.search(/Method of Application|How to Apply/i);
  const how = at < 0 ? "" : body.slice(at);
  const link = [...how.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => decodeEntities(m[1])).find((u) => !/hotnigerianjobs\.com|whatsapp|facebook|twitter|t\.me/i.test(u));
  const remote = /\bremote\b/i.test(`${place} ${post.title}`);
  return {
    ...post,
    description: text || post.description,
    location: `${place || "Nigeria"}${remote ? " (remote)" : " (on-site)"}`,
    restrictions: remote ? ["Nigeria"] : [place || "Nigeria"],
    applyUrl: link ? withoutTracking(link) : post.applyUrl,
    employmentType: text.match(/Job Type:\s*\n*\s*([^\n]{2,40})/i)?.[1]?.trim() ?? "",
  };
}
