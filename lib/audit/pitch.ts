// A short cold email in the user's own style: it opens with the one clearest problem found on
// the company's home page, says plainly what the user does, asks for one small paid fix, and
// ends with their promise. It goes to Gmail Drafts: you read it, and you send it yourself.

import type { Finding } from "./check.ts";

export type Person = { name: string; brand?: string; portfolio?: string; cpacc?: string };
export type PitchKind = "client" | "job";

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

// What the problem does to a real person, and a short version for the subject line.
function plainly(f: Finding): { line: string; short: string } {
  const n = f.count;
  switch (f.id) {
    case "alt":
      return { line: `${n} ${s(n, "image has", "images have")} no alt text, so a screen reader user hears the file name, or nothing.`, short: `${n} ${s(n, "image", "images")} a screen reader can't describe` };
    case "labels":
      return { line: `${n} form ${s(n, "field has", "fields have")} no label, so a screen reader user lands on a box and isn't told what to type.`, short: `${n} form ${s(n, "field", "fields")} with no label` };
    case "names":
      return { line: `${n} ${s(n, "link or button has", "links or buttons have")} no name, so a screen reader just says "button" and people can't tell what it does.`, short: `${n} ${s(n, "button", "buttons")} a screen reader can't name` };
    case "zoom":
      return { line: "The page blocks pinch-zoom on phones, so people with low vision can't make the text bigger.", short: "pinch-zoom is blocked on phones" };
    case "lang":
      return { line: "The page doesn't say what language it's in, so screen readers may read it with the wrong accent.", short: "the page doesn't say its language" };
    case "title":
      return { line: "The page has no title, so the browser tab and screen readers have nothing to announce.", short: "the page has no title" };
    case "h1":
      return { line: "There's no main heading, and screen reader users jump between headings to find their way.", short: "no main heading" };
    case "skips":
      return { line: "The heading levels skip, so screen reader users lose track of how the page is laid out.", short: "heading levels skip" };
    case "autoplay":
      return { line: "Sound starts on its own and talks over a screen reader.", short: "sound plays by itself" };
    default:
      return { line: `${f.title}. ${f.detail}`, short: f.title.toLowerCase() };
  }
}

export function pitch(company: string, site: string, findings: Finding[], me: Person, contactName = "", kind: PitchKind = "client"): { subject: string; body: string } {
  const host = site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
  const [top, ...rest] = findings;
  const { line, short } = plainly(top);
  const hello = contactName ? `Hi ${contactName.split(/\s+/)[0]},` : `Hi ${company} team,`;
  const more = rest.length ? ` I found ${rest.length} other ${s(rest.length, "issue", "issues")} too.` : "";
  const who =
    kind === "job"
      ? "That's my work. I'm a frontend developer: I test websites with a keyboard and a screen reader, then fix the code. I started self-taught, and I now do this on live client sites."
      : `That's my work. I test websites with a keyboard and a screen reader, then fix the code${me.brand ? `, through ${me.brand}` : ""}.`;
  const ask =
    kind === "job"
      ? "Unconventional as it may seem, let me fix this one issue as a small paid task. If you like the result, let's talk about a role on your team. I promise you'll smile back at this decision."
      : "Unconventional as it may seem, let me fix this one first, at a budget that works for you. I promise you'll smile back at this decision.";
  const body = [
    hello,
    "",
    `I looked at the code of ${host}'s home page. ${line}${more} Most visitors would never notice, but some people can't get past it.`,
    "",
    who,
    "",
    ask,
    "",
    ...(me.portfolio ? [`My work: ${me.portfolio}`, ""] : []),
    "Best regards,",
    me.name,
    "",
    "If this isn't useful, reply \"no\" and I won't write again.",
  ];
  return { subject: `${host}: ${short}`, body: body.join("\n") };
}
