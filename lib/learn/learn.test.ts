import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTranscript, parseOembed, videoId } from "./youtube.ts";
import { firstReview, isDue, nextReview, reviewLabel } from "./review.ts";

test("reads the video id from every kind of YouTube link", () => {
  for (const u of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    "youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "dQw4w9WgXcQ",
  ])
    assert.equal(videoId(u), "dQw4w9WgXcQ", u);
  assert.equal(videoId("https://vimeo.com/123"), null);
  assert.equal(videoId("https://www.youtube.com/@somechannel"), null);
  assert.equal(videoId("not a link"), null);
});

test("oEmbed gives the title, channel and a safe thumbnail", () => {
  const v = parseOembed("dQw4w9WgXcQ", { title: "Never Gonna Give You Up", author_name: "Rick Astley", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" });
  assert.equal(v.title, "Never Gonna Give You Up");
  assert.equal(v.channel, "Rick Astley");
  assert.equal(v.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(parseOembed("dQw4w9WgXcQ", { thumbnail_url: "javascript:alert(1)" }).thumbnail, null);
  assert.equal(parseOembed("dQw4w9WgXcQ", null).title, "YouTube video");
});

test("a pasted 'Show transcript' becomes plain text", () => {
  const pasted = "Transcript\n0:00\n2 seconds\n[Music]\nwelcome back to the channel\n0:04\ntoday we look at WCAG 2.2 , focus states\n1:02:03 and that is the end .\n";
  assert.equal(cleanTranscript(pasted), "welcome back to the channel today we look at WCAG 2.2, focus states and that is the end.");
});

test("notes come back after 1, 3, 7, 21 and 60 days, and 'Again' starts over", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  assert.deepEqual(firstReview(now), { step: 0, due: "2026-11-07" });
  assert.deepEqual(nextReview(0, "remembered", now), { step: 1, due: "2026-11-09" });
  assert.deepEqual(nextReview(3, "remembered", now), { step: 4, due: "2027-01-05" });
  assert.deepEqual(nextReview(4, "remembered", now), { step: 5, due: null });
  assert.deepEqual(nextReview(3, "again", now), { step: 0, due: "2026-11-07" });
  assert.equal(isDue("2026-11-06", now), true);
  assert.equal(isDue("2026-11-07", now), false);
  assert.equal(reviewLabel(0, "2026-11-07", now), "Review tomorrow");
  assert.equal(reviewLabel(5, null, now), "Learned");
});

test("long text is split near sentence ends, and very long text keeps parts from start to end", async () => {
  const { splitText } = await import("./ai.ts");
  const sentence = "This is one sentence about focus order. ";
  const short = splitText(sentence.repeat(10));
  assert.equal(short.parts.length, 1);
  const long = splitText(sentence.repeat(2000), 12_000, 12);
  assert.ok(long.parts.every((p) => p.length <= 12_000 && p.endsWith(".")));
  const huge = splitText(`START ${sentence.repeat(20000)} END.`, 12_000, 12);
  assert.equal(huge.parts.length, 12);
  assert.ok(huge.skipped > 0 && huge.parts[0].startsWith("START") && huge.parts[11].endsWith("END."));
});

test("the AI's note is read safely: bad shapes rejected, lists capped, platforms checked", async () => {
  const { parseNote } = await import("./ai.ts");
  const good = parseNote('Sure! {"summary":"Focus must be visible — always.","points":["One.","Two."],"questions":["Why?"],"posts":[{"platform":"twitter","text":"Short."},{"platform":"TikTok","text":"no"}],"ideas":["A"],"projects":["B"]}');
  assert.ok(good);
  assert.equal(good.summary, "Focus must be visible, always.");
  assert.deepEqual(good.posts, [{ platform: "X", text: "Short." }]);
  assert.equal(parseNote('{"summary":"","points":["a","b"]}'), null);
  assert.equal(parseNote("not json"), null);
});

test("making a note: one call for short text, parts then a join for long text, and a clear message with no AI", async () => {
  const { makeNote } = await import("./ai.ts");
  const calls: string[] = [];
  const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  const fake = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push(body.messages[1].content.slice(0, 20));
    return body.messages[0].content.includes("one part")
      ? reply('{"points":["A point."]}')
      : reply('{"summary":"It explains focus.","points":["One.","Two."],"questions":[],"posts":[],"ideas":[],"projects":[]}');
  }) as typeof fetch;
  const p = [{ name: "free", baseUrl: "https://api.groq.com/openai/v1", apiKey: "k", model: "openai/gpt-oss-120b" }];
  const src = { kind: "video" as const, title: "Focus", by: "" };
  const one = await makeNote(src, "Focus order matters. ".repeat(30), p, fake);
  assert.ok(one.ok && one.parts === 1 && calls.length === 1);
  calls.length = 0;
  const many = await makeNote(src, "Focus order matters. ".repeat(1500), p, fake);
  assert.ok(many.ok && many.parts === 3 && calls.length === 4);
  const off = await makeNote(src, "text ".repeat(100), [], fake);
  assert.ok(!off.ok && /AI is off/.test(off.error));
});

test("Groq's small model, then NVIDIA, join the AI list before the Gateway", async () => {
  const { learnProviders } = await import("./ai.ts");
  const names = learnProviders({ FREE_AI_BASE_URL: "https://api.groq.com/openai/v1", FREE_AI_API_KEY: "g", FREE_AI_MODEL: "m", NVIDIA_API_KEY: "n", AI_GATEWAY_API_KEY: "a" }).map((p) => p.name);
  assert.deepEqual(names, ["free", "free-small", "nvidia", "gateway"]);
});

test("Open Library results keep only free or borrowable works, with safe links and covers", async () => {
  const { openLibraryUrl, parseOpenLibrary } = await import("./books.ts");
  assert.equal(new URL(openLibraryUrl("javascript")).searchParams.get("q"), "javascript ebook_access:[borrowable TO *]");
  const books = parseOpenLibrary(
    {
      docs: [
        { key: "/works/OL123W", title: "Eloquent Javascript", author_name: ["Marijn Haverbeke"], first_publish_year: 2009, cover_i: 77, ebook_access: "public" },
        { key: "/works/OL9W", title: "JavaScript", author_name: ["David Flanagan"], ebook_access: "borrowable" },
        { key: "/works/OL5W", title: "Locked", ebook_access: "no_ebook" },
        { key: "javascript:alert(1)", title: "Bad", ebook_access: "public" },
      ],
    },
    "frontend",
  );
  assert.equal(books.length, 2);
  assert.deepEqual([books[0].url, books[0].access, books[0].cover], ["https://openlibrary.org/works/OL123W", "free", "https://covers.openlibrary.org/b/id/77-M.jpg"]);
  assert.equal(books[1].access, "borrow");
});

test("Profile tracks pick the book fields, always with career", async () => {
  const { fieldsForTracks, FREE_BOOKS, FIELDS } = await import("./books.ts");
  assert.deepEqual(fieldsForTracks(["frontend", "unknown", "accessibility"]), ["accessibility", "frontend", "career"]);
  for (const f of FIELDS) assert.ok(FREE_BOOKS.some((b) => b.field === f), f);
  assert.ok(FREE_BOOKS.every((b) => b.url.startsWith("https://")));
});

test("an EPUB's chapters are read in spine order", async () => {
  const { epubText } = await import("./read-book.ts");
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const d = mkdtempSync(join(tmpdir(), "epub-"));
  mkdirSync(join(d, "META-INF"));
  mkdirSync(join(d, "OEBPS"));
  writeFileSync(join(d, "mimetype"), "application/epub+zip");
  writeFileSync(join(d, "META-INF/container.xml"), '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
  writeFileSync(join(d, "OEBPS/content.opf"), '<package><manifest><item id="b" href="two.xhtml"/><item id="a" href="one.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
  writeFileSync(join(d, "OEBPS/one.xhtml"), "<html><head><title>x</title></head><body><h1>Chapter one</h1><p>Start here.</p></body></html>");
  writeFileSync(join(d, "OEBPS/two.xhtml"), "<html><body><p>Then this.</p></body></html>");
  execFileSync("zip", ["-q", "-r", "book.epub", "mimetype", "META-INF", "OEBPS"], { cwd: d });
  const b = readFileSync(join(d, "book.epub"));
  const r = await epubText(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.equal(r.pages, 2);
  assert.ok(r.text.indexOf("Chapter one") < r.text.indexOf("Then this."));
  assert.ok(!r.text.includes("<p>"));
});

test("a busy provider is waited for once, then the next one is asked", async () => {
  const { partNotes } = await import("./ai.ts");
  const seen: string[] = [];
  let first = true;
  const fake = (async (url: string) => {
    seen.push(url);
    if (url.includes("groq") && first) {
      first = false;
      return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
    }
    if (url.includes("groq")) return new Response("busy", { status: 429, headers: { "retry-after": "999" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"points":["From the backup."]}' } }] }));
  }) as typeof fetch;
  const providers = [
    { name: "free", baseUrl: "https://api.groq.com/openai/v1", apiKey: "k", model: "a" },
    { name: "nvidia", baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: "n", model: "b" },
  ];
  const r = await partNotes({ kind: "book", title: "T", by: "" }, "text", 1, 2, providers, fake);
  assert.ok(r.ok && r.points[0] === "From the backup.");
  assert.equal(seen.filter((u) => u.includes("groq")).length, 2);
});
