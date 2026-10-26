// Renders a CV or cover letter (Markdown) to a clean, ATS-friendly, tagged PDF on the server.
// Real text (not an image), one column, standard fonts, so parsers read it.
// Tagged: every heading, paragraph, list and link sits in a structure tree with a
// reading order, so screen readers can move by heading and list. Rules and underlines
// are marked as decoration. Links show as short words ("LinkedIn") you can click.

import {
  PDFDocument,
  type PDFPage,
  type PDFRef,
  type PDFArray,
  type PDFDict,
  type PDFFont,
  PDFName,
  PDFString,
  PDFHexString,
  PDFOperator,
  PDFOperatorNames as Ops,
  rgb,
  setCharacterSpacing,
  StandardFonts,
} from "pdf-lib";

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
    .replace(/[‐-–]/g, "-")
    .replace(/—/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/₦/g, "NGN ")
    .replace(/[→➔]/g, "->")
    .replace(/ /g, " ")
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

// pdf-lib measures with kerning, but the text is drawn without it: measure glyph by glyph,
// so the layout matches what is drawn and long lines do not drift.
const glyphs = new WeakMap<PDFFont, Map<string, number>>();
export function measure(font: PDFFont, text: string, size: number): number {
  let m = glyphs.get(font);
  if (!m) glyphs.set(font, (m = new Map()));
  let w = 0;
  for (const ch of text) {
    let g = m.get(ch);
    if (g === undefined) m.set(ch, (g = font.widthOfTextAtSize(ch, 1000)));
    w += g;
  }
  return (w * size) / 1000;
}

// WinAnsi codes 128-159 that are not Latin-1.
const WIN: Record<number, string> = { 128: "€", 133: "…", 145: "‘", 146: "’", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—", 153: "™" };

// The standard fonts are not embedded, so readers guess their widths and drift a few points
// over a long line. Writing the widths into the font makes every reader agree.
async function withWidths(doc: PDFDocument, font: PDFFont) {
  await font.embed();
  const dict = doc.context.lookup(font.ref) as PDFDict;
  const widths = [];
  for (let code = 32; code <= 255; code++) {
    const ch = code < 128 || code > 159 ? String.fromCharCode(code) : WIN[code];
    let w = 0;
    try {
      w = ch ? Math.round(font.widthOfTextAtSize(ch, 1000)) : 0;
    } catch {
      w = 0;
    }
    widths.push(w);
  }
  dict.set(PDFName.of("FirstChar"), doc.context.obj(32));
  dict.set(PDFName.of("LastChar"), doc.context.obj(255));
  dict.set(PDFName.of("Widths"), doc.context.obj(widths));
}

type Opts = { size: number; indent?: number; color?: Color; font?: "bold" | "italic"; lead?: number; gap?: number; width?: number };
type El = { ref: PDFRef; kids: PDFArray; type: string };

export async function cvPdf(markdown: string, title: string): Promise<Uint8Array> {
  const kind = markdown.match(/^<!--[^>]*kind:\s*(\w+)/)?.[1] ?? "cv";
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  doc.setTitle(pdfSafe(title));
  doc.setLanguage("en");
  doc.setCreator("Sales CRM");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  // ---------- structure tree ----------
  const rootKids = ctx.obj([]) as PDFArray;
  const root = ctx.obj({ Type: "StructTreeRoot", K: rootKids }) as PDFDict;
  const rootRef = ctx.register(root);
  const parentNums = ctx.obj([]) as PDFArray;
  let nextKey = 0;

  function elem(type: string, parent: El | null): El {
    const kids = ctx.obj([]) as PDFArray;
    const ref = ctx.register(ctx.obj({ Type: "StructElem", S: type, P: parent ? parent.ref : rootRef, K: kids }));
    (parent ? parent.kids : rootKids).push(ref);
    return { ref, kids, type };
  }
  const body = elem("Document", null);

  // Each page lists, by MCID, the element its marked content belongs to.
  let page!: PDFPage;
  let marks!: PDFArray;
  function newPage() {
    page = doc.addPage([PAGE.width, PAGE.height]);
    marks = ctx.obj([]) as PDFArray;
    const key = nextKey++;
    page.node.set(PDFName.of("StructParents"), ctx.obj(key));
    page.node.set(PDFName.of("Tabs"), PDFName.of("S"));
    parentNums.push(ctx.obj(key));
    parentNums.push(ctx.register(marks));
  }

  // Draws content as part of an element, so a reader knows what it is and where it goes.
  function mark(el: El, draw: () => void, actual?: string) {
    const mcid = marks.size();
    marks.push(el.ref);
    const props = ctx.obj({ MCID: mcid }) as PDFDict;
    if (actual) props.set(PDFName.of("ActualText"), PDFHexString.fromText(actual));
    // pdf-lib's types leave out dict operands, but it writes them correctly (/P <</MCID 0>> BDC).
    page.pushOperators(PDFOperator.of(Ops.BeginMarkedContentSequence, [PDFName.of(el.type), props as unknown as PDFName]));
    draw();
    page.pushOperators(PDFOperator.of(Ops.EndMarkedContent));
    el.kids.push(ctx.obj({ Type: "MCR", Pg: page.ref, MCID: mcid }));
  }
  // Rules and underlines are decoration: screen readers skip them.
  function artifact(draw: () => void) {
    page.pushOperators(PDFOperator.of(Ops.BeginMarkedContent, [PDFName.of("Artifact")]));
    draw();
    page.pushOperators(PDFOperator.of(Ops.EndMarkedContent));
  }

  newPage();
  let y = PAGE.height - PAGE.margin;
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;

  const need = (h: number) => {
    if (y - h < PAGE.margin) {
      newPage();
      y = PAGE.height - PAGE.margin;
    }
  };

  // An underline plus a click area that opens the address, tied to its Link element.
  function link(el: El, x: number, base: number, w: number, size: number, href: string, label: string) {
    artifact(() => page.drawLine({ start: { x, y: base - 1.5 }, end: { x: x + w, y: base - 1.5 }, thickness: 0.5, color: LINK }));
    const key = nextKey++;
    const annot = ctx.register(
      ctx.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [x, base - 3, x + w, base + size * 0.85],
        Border: [0, 0, 0],
        StructParent: key,
        Contents: PDFHexString.fromText(`${label.trim()}: ${href}`),
        A: { Type: "Action", S: "URI", URI: PDFString.of(href) },
      }),
    );
    page.node.addAnnot(annot);
    parentNums.push(ctx.obj(key));
    parentNums.push(el.ref);
    el.kids.push(ctx.obj({ Type: "OBJR", Obj: annot, Pg: page.ref }));
  }

  // Word-wraps runs inside one element. Links get their own Link element.
  function write(el: El, parts: Run[], o: Opts) {
    const { size } = o;
    const indent = o.indent ?? 0;
    const max = o.width ?? right - left - indent;
    const lineHeight = size * (o.lead ?? 1.4);
    const fontOf = (r: Run) => (o.font === "italic" ? italic : r.bold || o.font === "bold" ? bold : regular);
    const links = new Map<Run, El>();
    const words: { text: string; run: Run }[] = [];
    for (const r of parts) for (const w of r.text.split(/(\s+)/)) if (w) words.push({ text: w, run: r });
    let line: typeof words = [];
    let width = 0;
    const flush = () => {
      need(lineHeight);
      const base = y - size;
      let x = left + indent;
      // Neighbouring words of one run are drawn as one string, so copied text keeps its spaces.
      const segs: { text: string; run: Run }[] = [];
      for (const w of line) {
        const prev = segs[segs.length - 1];
        if (prev && prev.run === w.run) prev.text += w.text;
        else segs.push({ ...w });
      }
      // Text tools drop a space at the end of a string, so it moves to the front of the next one.
      // For a link, the underline and click area start after that space.
      for (let i = segs.length - 2; i >= 0; i--) {
        const tail = segs[i].text.match(/\s+$/)?.[0];
        if (!tail || !segs[i].text.trim()) continue;
        segs[i].text = segs[i].text.slice(0, -tail.length);
        segs[i + 1].text = tail + segs[i + 1].text;
      }
      for (const s of segs) {
        const font = fontOf(s.run);
        const sw = measure(font, s.text, size);
        const at = x;
        const draw = () => page.drawText(s.text, { x: at, y: base, size, font, color: s.run.href ? LINK : (o.color ?? BODY) });
        if (s.run.href) {
          let l = links.get(s.run);
          if (!l) links.set(s.run, (l = elem("Link", el)));
          mark(l, draw);
          const lead = measure(font, s.text.match(/^\s*/)![0], size);
          if (s.text.trim()) link(l, at + lead, base, sw - lead, size, s.run.href, s.run.text);
        } else mark(el, draw);
        x += sw;
      }
      y -= lineHeight;
      line = [];
      width = 0;
    };
    for (const w of words) {
      const ww = measure(fontOf(w.run), w.text, size);
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
    // Letter-spaced with the PDF's own character spacing, so parsers read one word.
    // ActualText gives screen readers the normal case, so capitals are not spelled out.
    mark(
      elem("H2", body),
      () => {
        page.pushOperators(setCharacterSpacing(0.9));
        page.drawText(pdfSafe(text.toUpperCase()), { x: left, y: y - size, size, font: bold, color: ACCENT });
        page.pushOperators(setCharacterSpacing(0));
      },
      pdfSafe(text),
    );
    y -= size + 4;
    artifact(() => page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: RULE }));
    y -= 6;
  }

  // "Role | 2023 - Present": the role on the left, the dates on the right, both in one heading.
  // The dates are drawn after the role, so parsers and screen readers read "Role 2023 - Present".
  function role(text: string) {
    y -= 3;
    need(44);
    const [name, ...rest] = text.split(" | ");
    const dates = pdfSafe(rest.join(" | "));
    const dw = dates ? measure(regular, dates, 9.5) : 0;
    const top = y;
    const h3 = elem("H3", body);
    write(h3, runs(name), { size: 10.5, font: "bold", color: INK, lead: 1.35, width: right - left - (dw ? dw + 14 : 0) });
    if (dates) mark(h3, () => page.drawText(` ${dates}`, { x: right - dw - measure(regular, " ", 9.5), y: top - 10.5, size: 9.5, font: regular, color: MUTED }));
  }

  let list: El | null = null;
  function item(parts: Run[]) {
    list ??= elem("L", body);
    const li = elem("LI", list);
    need(9.75 * 1.4);
    const base = y - 9.75;
    mark(elem("Lbl", li), () => page.drawText("•", { x: left + 3, y: base, size: 9.75, font: regular, color: ACCENT }));
    write(elem("LBody", li), parts, { size: 9.75, indent: 12, gap: 1.5 });
  }

  const lines = markdown.replace(/^<!--[\s\S]*?-->\s*/, "").split("\n");
  // A CV has name, headline, contact line. A letter has name, contact line.
  let afterName = 0; // 1 = the next line is the headline, 2 = the contact line
  let afterRole = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) {
      y -= 3;
      continue;
    }
    if (!/^[-*] /.test(l)) list = null;
    if (l.startsWith("# ")) {
      write(elem("H1", body), runs(l.slice(2)), { size: 23, font: "bold", color: INK, lead: 1.15, gap: 3 });
      afterName = kind === "letter" ? 2 : 1;
    } else if (afterName === 1) {
      write(elem("P", body), runs(l), { size: 11.5, font: "bold", color: ACCENT, gap: 2 });
      afterName = 2;
    } else if (afterName === 2) {
      // " | " becomes a quiet dot, and links stay as their short names.
      const parts = l.split(/\s+\|\s+/).flatMap((p, i) => [...(i ? [{ text: "  ·  ", bold: false }] : []), ...runs(p)]);
      write(elem("P", body), parts, { size: 9.5, color: MUTED, gap: kind === "letter" ? 12 : 2 });
      afterName = 0;
    } else if (l.startsWith("## ")) {
      heading(l.slice(3));
      afterRole = false;
    } else if (l.startsWith("### ")) {
      role(l.slice(4));
      afterRole = true;
    } else if (/^[-*] /.test(l)) {
      item(runs(l.slice(2)));
      afterRole = false;
    } else if (afterRole) {
      // The company line under a role.
      write(elem("P", body), runs(l.replace(/\s+\|\s+/g, "  ·  ")), { size: 9.5, font: "italic", color: MUTED, gap: 2 });
      afterRole = false;
    } else write(elem("P", body), runs(l), kind === "letter" ? { size: 10.5, lead: 1.5, gap: 4 } : { size: 9.75, lead: 1.45 });
  }

  // Every reader then spaces the text exactly as it was laid out, so no two words run together.
  for (const f of [regular, bold, italic]) await withWidths(doc, f);

  root.set(PDFName.of("ParentTree"), ctx.register(ctx.obj({ Nums: parentNums })));
  root.set(PDFName.of("ParentTreeNextKey"), ctx.obj(nextKey));
  doc.catalog.set(PDFName.of("StructTreeRoot"), rootRef);
  doc.catalog.set(PDFName.of("MarkInfo"), ctx.obj({ Marked: true }));
  // PDF readers show the document title, not the file name.
  doc.catalog.set(PDFName.of("ViewerPreferences"), ctx.obj({ DisplayDocTitle: true }));
  return doc.save();
}
