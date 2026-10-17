// Turns the kit's Markdown into print-ready HTML (for PDF) and a Word
// document. Shared by the Desktop build (Node) and the Apply page (browser),
// so a file looks the same wherever it was made.
//
// Each Markdown file may start with a meta comment:
//   <!-- kind: proposal | eyebrow: Bihub Technology | paper: Letter -->
// kind = proposal | cv | letter | guide. It picks the PDF layout.

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("marked"), require("docx"));
  else root.Render = factory(root.marked, root.docx);
})(this, function (marked, docx) {
  // Single line breaks in Markdown become real line breaks (address blocks, sign-offs).
  marked.setOptions({ breaks: true });

  const stripMeta = md => md.replace(/^<!--[\s\S]*?-->\s*/, "");
  const titleOf = (md, fallback) => (md.match(/^# (.+)$/m) || [, fallback || "Document"])[1];

  function readMeta(md) {
    const m = md.match(/^<!--([\s\S]*?)-->/);
    const meta = { kind: "guide", eyebrow: "", paper: "Letter" };
    if (!m) return meta;
    for (const pair of m[1].split("|")) {
      const [k, ...v] = pair.split(":");
      if (k && v.length) meta[k.trim()] = v.join(":").trim();
    }
    return meta;
  }

  // ---------- HTML (printed to PDF) ----------

  function toHtml(md, css) {
    const meta = readMeta(md);
    const body = marked.parse(stripMeta(md));
    const eyebrow = meta.eyebrow ? `<p class="eyebrow">${meta.eyebrow}</p>` : "";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${titleOf(md)}</title><style>@page{size:${meta.paper};margin:0.75in 0.8in}${css}</style></head>
<body class="${meta.kind}"><main>${eyebrow}${body}</main></body></html>`;
  }

  // ---------- Word (built from the same Markdown tokens) ----------

  const { Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow,
    TableCell, WidthType, BorderStyle, UnderlineType } = docx;

  const ACCENT = "0F5C4D";
  const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

  function decode(s) {
    return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }

  function inline(tokens = [], style = {}) {
    const runs = [];
    for (const t of tokens) {
      if (t.type === "strong") runs.push(...inline(t.tokens, { ...style, bold: true }));
      else if (t.type === "em") runs.push(...inline(t.tokens, { ...style, italics: true }));
      else if (t.type === "link") runs.push(new ExternalHyperlink({ link: t.href,
        children: [new TextRun({ text: t.text, ...style, color: "1155CC", underline: { type: UnderlineType.SINGLE } })] }));
      else if (t.type === "codespan") runs.push(new TextRun({ text: t.text, ...style, font: "Menlo" }));
      else if (t.type === "br") runs.push(new TextRun({ break: 1 }));
      else if (t.type === "escape") runs.push(new TextRun({ text: t.text, ...style }));
      else if (t.tokens) runs.push(...inline(t.tokens, style));
      else runs.push(new TextRun({ text: decode(t.text ?? t.raw ?? ""), ...style }));
    }
    return runs;
  }

  function list(token, level = 0) {
    const out = [];
    for (const item of token.items) {
      const runs = [];
      if (item.task) runs.push(new TextRun({ text: item.checked ? "[x] " : "[ ] " }));
      for (const t of item.tokens.filter(t => t.type !== "list" && t.type !== "checkbox")) runs.push(...inline(t.tokens || [t]));
      out.push(new Paragraph(token.ordered
        ? { numbering: { reference: "num", level }, children: runs, spacing: { after: 60 } }
        : { bullet: { level }, children: runs, spacing: { after: 60 } }));
      for (const sub of item.tokens.filter(t => t.type === "list")) out.push(...list(sub, level + 1));
    }
    return out;
  }

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" };
  function table(token) {
    const row = (cells, header) => new TableRow({ tableHeader: header, children: cells.map(c =>
      new TableCell({
        borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
        shading: header ? { fill: "E8F0EE" } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: inline(c.tokens, header ? { bold: true } : {}) })],
      })) });
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [row(token.header, true), ...token.rows.map(r => row(r, false))] });
  }

  function toDocx(md) {
    const children = [];
    for (const t of marked.lexer(stripMeta(md))) {
      if (t.type === "heading") children.push(new Paragraph({ heading: HEADINGS[t.depth - 1] || HeadingLevel.HEADING_4,
        spacing: { before: 240, after: 100 }, children: inline(t.tokens) }));
      else if (t.type === "paragraph") children.push(new Paragraph({ spacing: { after: 120 }, children: inline(t.tokens) }));
      else if (t.type === "list") children.push(...list(t));
      else if (t.type === "table") { children.push(table(t)); children.push(new Paragraph({ children: [] })); }
      else if (t.type === "blockquote") children.push(new Paragraph({ indent: { left: 400 }, spacing: { after: 120 },
        children: inline(t.tokens.flatMap(b => b.tokens || []), { italics: true }) }));
      else if (t.type === "hr") children.push(new Paragraph({ border: { bottom: { color: "BBBBBB", style: BorderStyle.SINGLE, size: 4, space: 1 } } }));
    }
    return new docx.Document({
      title: titleOf(md), creator: "Bryan Temple Onyenghan",
      styles: {
        default: { document: { run: { font: "Calibri", size: 21, color: "222222" } } },
        paragraphStyles: [
          { id: "Heading1", name: "Heading 1", run: { size: 36, bold: true, color: "1A1F2B" } },
          { id: "Heading2", name: "Heading 2", run: { size: 24, bold: true, color: ACCENT } },
          { id: "Heading3", name: "Heading 3", run: { size: 22, bold: true, color: "1A1F2B" } },
          { id: "Heading4", name: "Heading 4", run: { size: 21, bold: true, color: "1A1F2B" } },
        ],
      },
      numbering: { config: [{ reference: "num", levels: [0, 1].map(level => ({
        level, format: "decimal", text: `%${level + 1}.`, alignment: "left",
        style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } } })) }] },
      sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
    });
  }

  return { readMeta, toHtml, toDocx, titleOf };
});
