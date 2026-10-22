// Renders the CV Markdown to a plain, ATS-friendly PDF on the server.
// Real text (not an image), one column, standard fonts, so parsers read it.

import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

const PAGE = { width: 612, height: 792, margin: 54 };
const ACCENT = rgb(0.06, 0.36, 0.3);
const INK = rgb(0.1, 0.1, 0.1);

type Run = { text: string; bold: boolean };

// The standard PDF fonts only know Windows-1252, so anything else is swapped or dropped.
export function pdfSafe(s: string): string {
  return s
    .replace(/[‐-–]/g, "-").replace(/—/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/…/g, "...").replace(/₦/g, "NGN ").replace(/[→➔]/g, "->").replace(/ /g, " ")
    .replace(/[^\x20-\x7E¡-ÿ•]/g, "");
}

const SHORT_LINK = /^(linkedin|portfolio|behance|github|website)$/i;
function inlineText(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label: string, url: string) => (SHORT_LINK.test(label) ? url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : label))
    .replace(/\\([*_`[\]])/g, "$1");
}

function runs(s: string): Run[] {
  return inlineText(s).split("**").map((text, i) => ({ text: pdfSafe(text), bold: i % 2 === 1 })).filter((r) => r.text);
}

export async function cvPdf(markdown: string, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(title));
  doc.setLanguage("en");
  doc.setCreator("Sales CRM");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const maxWidth = PAGE.width - PAGE.margin * 2;

  const need = (h: number) => {
    if (y - h < PAGE.margin) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };

  function write(parts: Run[], size: number, opts: { indent?: number; color?: ReturnType<typeof rgb>; gap?: number; bullet?: boolean; forceBold?: boolean } = {}) {
    const indent = opts.indent ?? 0;
    const lineHeight = size * 1.35;
    const words: { text: string; font: PDFFont }[] = [];
    for (const r of parts) for (const w of r.text.split(/(\s+)/)) if (w) words.push({ text: w, font: r.bold || opts.forceBold ? bold : regular });
    let line: typeof words = [];
    let width = 0;
    let first = true;
    const flush = () => {
      need(lineHeight);
      let x = PAGE.margin + indent;
      if (opts.bullet && first) page.drawText("•", { x: x - 10, y: y - size, size, font: regular, color: INK });
      for (const w of line) {
        page.drawText(w.text, { x, y: y - size, size, font: w.font, color: opts.color ?? INK });
        x += w.font.widthOfTextAtSize(w.text, size);
      }
      y -= lineHeight;
      line = [];
      width = 0;
      first = false;
    };
    for (const w of words) {
      const ww = w.font.widthOfTextAtSize(w.text, size);
      if (width + ww > maxWidth - indent && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
        flush();
        if (/^\s+$/.test(w.text)) continue;
      }
      line.push(w);
      width += ww;
    }
    if (line.length) flush();
    y -= opts.gap ?? 0;
  }

  const lines = markdown.replace(/^<!--[\s\S]*?-->\s*/, "").split("\n");
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) {
      y -= 4;
      continue;
    }
    if (l.startsWith("# ")) write(runs(l.slice(2)), 20, { forceBold: true, gap: 2 });
    else if (l.startsWith("## ")) {
      y -= 6;
      need(30);
      write(runs(l.slice(3).toUpperCase()), 11, { forceBold: true, color: ACCENT });
      page.drawLine({ start: { x: PAGE.margin, y: y + 2 }, end: { x: PAGE.width - PAGE.margin, y: y + 2 }, thickness: 0.6, color: ACCENT });
      y -= 4;
    } else if (l.startsWith("### ")) write(runs(l.slice(4)), 10.5, { forceBold: true });
    else if (/^[-*] /.test(l)) write(runs(l.slice(2)), 10, { indent: 14, bullet: true, gap: 1 });
    else write(runs(l), 10);
  }
  return doc.save();
}
