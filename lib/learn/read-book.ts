// The text of a book you uploaded: PDF pages, or EPUB chapters in reading order.

import { readZipFiles } from "../import/unzip.ts";
import { htmlToText } from "../jobs/text.ts";

export type BookText = { text: string; pages: number };

const dir = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "");
const join = (base: string, rel: string) => {
  const parts = (base + decodeURIComponent(rel.split("#")[0])).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
};

export async function epubText(buf: ArrayBuffer): Promise<BookText> {
  const files = await readZipFiles(buf, (n) => /\.(xml|opf|x?html?)$/i.test(n));
  const container = files.get("META-INF/container.xml") ?? "";
  const opfPath = container.match(/full-path="([^"]+)"/)?.[1] ?? [...files.keys()].find((k) => k.endsWith(".opf")) ?? "";
  const opf = files.get(opfPath) ?? "";
  const items = new Map([...opf.matchAll(/<item\b[^>]*>/g)].map(([tag]) => [tag.match(/\bid="([^"]+)"/)?.[1] ?? "", tag.match(/\bhref="([^"]+)"/)?.[1] ?? ""]));
  const spine = [...opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)].map((m) => items.get(m[1])).filter((h): h is string => Boolean(h));
  const order = spine.length ? spine.map((h) => join(dir(opfPath), h)) : [...files.keys()].filter((k) => /\.x?html?$/i.test(k)).sort();
  const chapters = order.map((p) => files.get(p)).filter((h): h is string => Boolean(h)).map((h) => htmlToText(h.replace(/^[\s\S]*?<body[^>]*>/i, "")).trim()).filter(Boolean);
  return { text: chapters.join("\n\n"), pages: chapters.length };
}

export async function pdfText(buf: ArrayBuffer): Promise<BookText> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/(?:\s*\.){4,}\s*\d*/g, " ").replace(/[ \t]+/g, " ").trim());
  return { text: pages.join("\n\n"), pages: totalPages };
}

export async function bookText(buf: ArrayBuffer, mime: string): Promise<BookText> {
  if (mime === "application/epub+zip") return epubText(buf);
  if (mime === "application/pdf") return pdfText(buf);
  throw new Error("Only PDF and EPUB books can be read.");
}
