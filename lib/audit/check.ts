// A quick, honest accessibility check of one web page, from its HTML alone.
// It finds problems a machine can prove (missing alt text, unlabelled fields, zoom blocked).
// It can't judge colour contrast, keyboard use or screen reader flow: a real audit does that.

export type Finding = { id: string; title: string; detail: string; count: number; wcag: string; level: "A" | "AA"; weight: number };
export type Audit = { findings: Finding[]; score: number; title: string; checked: number };

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const attr = (tag: string, name: string) =>
  tag
    .match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
    ?.slice(2)
    .find((v) => v !== undefined) ?? null;

export function auditHtml(raw: string): Audit {
  const html = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, "");
  const findings: Finding[] = [];
  const add = (f: Finding) => f.count > 0 && findings.push(f);

  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  add({
    id: "lang",
    title: "The page does not say its language",
    detail: "Screen readers guess the language and may read it with the wrong accent.",
    count: attr(htmlTag, "lang") ? 0 : 1,
    wcag: "3.1.1",
    level: "A",
    weight: 8,
  });

  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  add({ id: "title", title: "The page has no title", detail: "The tab and screen readers have nothing to announce.", count: title ? 0 : 1, wcag: "2.4.2", level: "A", weight: 6 });

  const viewport = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i)?.[0] ?? "";
  const content = (attr(viewport, "content") ?? "").toLowerCase();
  add({
    id: "zoom",
    title: "Zoom is blocked on phones",
    detail: "People with low vision can't pinch to enlarge the text.",
    count: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(content) ? 1 : 0,
    wcag: "1.4.4",
    level: "AA",
    weight: 10,
  });

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = imgs.filter((t) => attr(t, "alt") === null && attr(t, "role") !== "presentation" && attr(t, "aria-hidden") !== "true");
  add({
    id: "alt",
    title: `${noAlt.length} image${noAlt.length === 1 ? "" : "s"} with no alt text`,
    detail: "Blind visitors hear the file name, or nothing at all.",
    count: noAlt.length,
    wcag: "1.1.1",
    level: "A",
    weight: 15,
  });

  // Fields: a <label for>, a wrapping <label>, aria-label or aria-labelledby, or a title.
  const labelled = new Set([...html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/gi)].map((m) => m[1]));
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)].map((m) => ({ tag: m[0], at: m.index ?? 0 }));
  const unlabelled = inputs.filter(({ tag, at }) => {
    const type = (attr(tag, "type") ?? "text").toLowerCase();
    if (["hidden", "submit", "button", "reset", "image"].includes(type)) return false;
    if (attr(tag, "aria-label") || attr(tag, "aria-labelledby") || attr(tag, "title")) return false;
    const id = attr(tag, "id");
    if (id && labelled.has(id)) return false;
    const before = html.slice(Math.max(0, at - 400), at);
    return !(before.lastIndexOf("<label") > before.lastIndexOf("</label>"));
  });
  add({
    id: "labels",
    title: `${unlabelled.length} form field${unlabelled.length === 1 ? "" : "s"} with no label`,
    detail: "Screen reader users hear 'edit text' and can't tell what to type.",
    count: unlabelled.length,
    wcag: "1.3.1, 4.1.2",
    level: "A",
    weight: 15,
  });

  const controls = [...html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
  const nameless = controls.filter(([, , attrs, inner]) => {
    if (/aria-label(ledby)?\s*=|title\s*=/i.test(attrs)) return false;
    if (/<img\b[^>]*\balt=["'][^"']+["']/i.test(inner) || /aria-label\s*=/i.test(inner)) return false;
    return !strip(inner);
  });
  add({
    id: "names",
    title: `${nameless.length} link${nameless.length === 1 ? "" : "s"} or button${nameless.length === 1 ? "" : "s"} with no name`,
    detail: "Icon-only controls are announced as just 'button' or 'link'.",
    count: nameless.length,
    wcag: "2.4.4, 4.1.2",
    level: "A",
    weight: 15,
  });

  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  add({ id: "h1", title: "No main heading", detail: "Screen reader users jump by headings; there is no h1 to start from.", count: levels.includes(1) ? 0 : 1, wcag: "1.3.1", level: "A", weight: 6 });
  const skips = levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1).length;
  add({
    id: "skips",
    title: `Heading levels skip ${skips} time${skips === 1 ? "" : "s"}`,
    detail: "The page outline has gaps, which makes it harder to follow.",
    count: skips,
    wcag: "1.3.1",
    level: "A",
    weight: 4,
  });

  const autoplay = (html.match(/<(video|audio)\b[^>]*\bautoplay\b[^>]*>/gi) ?? []).filter((t) => !/\bmuted\b/i.test(t)).length;
  add({ id: "autoplay", title: "Sound plays by itself", detail: "Audio that starts on its own talks over screen readers.", count: autoplay, wcag: "1.4.2", level: "A", weight: 8 });

  const lost = findings.reduce((n, f) => n + Math.min(f.weight, f.weight * (f.count > 3 ? 1 : f.count / 3 + 0.34)), 0);
  findings.sort((a, b) => b.weight - a.weight || b.count - a.count);
  return { findings, score: Math.max(0, Math.round(100 - lost)), title, checked: 9 };
}
