// Renders the CV Markdown to a clean, ATS-friendly PDF on the server.
// Real text (not an image), one column, standard fonts, so parsers read it.
// Links show as short words ("LinkedIn", "Portfolio") that you can click.

import { PDFDocument, type PDFPage, PDFName, PDFString, rgb, StandardFonts } from "pdf-lib";

const PAGE = { width: 612, height: 792, margin: 50 };
const ACCENT = rgb(0.06, 0.36, 0.3); // #0f5c4d, 7.9:1 on white
const INK = rgb(0.1, 0.12, 0.17);
const BODY = rgb(0.17, 0.19, 0.23);
const MUTED = rgb(0.33, 0.36, 0.41); // about 7:1 on white
const LINK = rgb(0.04, 0.34, 0.82); // #0b57d0, 6.6:1 on white
const RULE = rgb(0.82, 0.85, 0.87);

type Run = { text: string; bold: boolean; href?: string };
type Color = ReturnType<typeof rgb>;

// The standard PDF fonts only know Windows-1252, so anything else is swapped or dropped.
export function pdfSafe(s: string): string {
  return s
    .replace(/[‐-–]/g, "-").replace(/—/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/…/g, "...").replace(/₦/g, "NGN ").replace(/[→➔]/g, "->").replace(/ /g, " ")
    .replace(/[^\x20-\x7E¡-ÿ•·]/g, "");
}

// **bold** and [label](https://…) become runs; everything else is plain text.
export function runs(s: string): Run[] {
  const out: Run[] = [];
  let bold = false;
  let last = 0;
  const push = (text: string, href?: string) => {
    const t = pdfSafe(text.replace(/\\([*_`[\]])/g, "$1"));
    if (t) out.push({ text: t, bold, ...(href ? { href } : {}) });
  };
  for (const m of s.matchAll(/\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    push(s.slice(last, m.index));
    if (m[0] === "**") bold = !bold;
    else push(m[1], m[2]);
    last = m.index + m[0].length;
  }
  push(s.slice(last));
  return out;
}

type Opts = { size: number; indent?: number; color?: Color; font?: "bold" | "italic"; lead?: number; bullet?: boolean; gap?: number; width?: number };

export async function cvPdf(markdown: string, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(title));
  doc.setLanguage("en");
  doc.setCreator("Sales CRM");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;

  const need = (h: number) => {
    if (y - h < PAGE.margin) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };

  // An underline plus a click area that opens the address.
  function link(x: number, base: number, w: number, size: number, href: string) {
    page.drawLine({ start: { x, y: base - 1.5 }, end: { x: x + w, y: base - 1.5 }, thickness: 0.5, color: LINK });
    const annot = doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, base - 3, x + w, base + size * 0.85],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(href) },
    });
    page.node.addAnnot(doc.context.register(annot));
  }

  // Word-wraps runs across lines. Links keep their colour and get a click area.
  function write(parts: Run[], o: Opts) {
    const { size } = o;
    const indent = o.indent ?? 0;
    const max = o.width ?? right - left - indent;
    const lineHeight = size * (o.lead ?? 1.4);
    const fontOf = (r: Run) => (o.font === "italic" ? italic : r.bold || o.font === "bold" ? bold : regular);
    const words: { text: string; run: Run }[] = [];
    for (const r of parts) for (const w of r.text.split(/(\s+)/)) if (w) words.push({ text: w, run: r });
    let line: typeof words = [];
    let width = 0;
    let first = true;
    const flush = () => {
      need(lineHeight);
      const base = y - size;
      let x = left + indent;
      if (o.bullet && first) page.drawText("•", { x: x - 9, y: base, size, font: regular, color: ACCENT });
      for (const w of line) {
        const font = fontOf(w.run);
        const ww = font.widthOfTextAtSize(w.text, size);
        page.drawText(w.text, { x, y: base, size, font, color: w.run.href ? LINK : (o.color ?? BODY) });
        if (w.run.href && w.text.trim()) link(x, base, ww, size, w.run.href);
        x += ww;
      }
      y -= lineHeight;
      line = [];
      width = 0;
      first = false;
    };
    for (const w of words) {
      const ww = fontOf(w.run).widthOfTextAtSize(w.text, size);
      if (width + ww > max && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
        flush();
        if (/^\s+$/.test(w.text)) continue;
      }
      line.push(w);
      width += ww;
    }
    if (line.length) flush();
    y -= o.gap ?? 0;
  }

  function heading(text: string) {
    y -= 9;
    need(48);
    const size = 9.5;
    // Letter-spaced by hand: the standard fonts have no tracking setting.
    let x = left;
    for (const ch of pdfSafe(text.toUpperCase())) {
      page.drawText(ch, { x, y: y - size, size, font: bold, color: ACCENT });
      x += bold.widthOfTextAtSize(ch, size) + 0.9;
    }
    y -= size + 4;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: RULE });
    y -= 6;
  }

  // "Role | 2023 - Present": the role on the left, the dates on the right.
  function role(text: string) {
    y -= 3;
    need(44);
    const [name, ...rest] = text.split(" | ");
    const dates = pdfSafe(rest.join(" | "));
    const dw = dates ? regular.widthOfTextAtSize(dates, 9.5) : 0;
    if (dates) page.drawText(dates, { x: right - dw, y: y - 10.5, size: 9.5, font: regular, color: MUTED });
    write(runs(name), { size: 10.5, font: "bold", color: INK, lead: 1.35, width: right - left - (dw ? dw + 14 : 0) });
  }

  const lines = markdown.replace(/^<!--[\s\S]*?-->\s*/, "").split("\n");
  let afterName = 0; // 1 = the next line is the headline, 2 = the contact line
  let afterRole = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) {
      y -= 3;
      continue;
    }
    if (l.startsWith("# ")) {
      write(runs(l.slice(2)), { size: 23, font: "bold", color: INK, lead: 1.15, gap: 3 });
      afterName = 1;
    } else if (afterName === 1) {
      write(runs(l), { size: 11.5, font: "bold", color: ACCENT, gap: 2 });
      afterName = 2;
    } else if (afterName === 2) {
      // " | " becomes a quiet dot, and links stay as their short names.
      const parts = l.split(/\s+\|\s+/).flatMap((p, i) => [...(i ? [{ text: "  ·  ", bold: false }] : []), ...runs(p)]);
      write(parts, { size: 9.5, color: MUTED, gap: 2 });
      afterName = 0;
    } else if (l.startsWith("## ")) {
      heading(l.slice(3));
      afterRole = false;
    } else if (l.startsWith("### ")) {
      role(l.slice(4));
      afterRole = true;
    } else if (/^[-*] /.test(l)) {
      write(runs(l.slice(2)), { size: 9.75, indent: 12, bullet: true, gap: 1.5 });
      afterRole = false;
    } else if (afterRole) {
      // The company line under a role.
      write(runs(l.replace(/\s+\|\s+/g, "  ·  ")), { size: 9.5, font: "italic", color: MUTED, gap: 2 });
      afterRole = false;
    } else write(runs(l), { size: 9.75, lead: 1.45 });
  }

  // PDF readers show the document title, not the file name.
  doc.catalog.set(PDFName.of("ViewerPreferences"), doc.context.obj({ DisplayDocTitle: true }));
  return doc.save();
}
