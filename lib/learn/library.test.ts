import { test } from "node:test";
import assert from "node:assert/strict";
import { chaptersFrom, episodeLessons, lessonsFrom, LESSON_MAX, PODCASTS, READING_LIST, seconds } from "./library.ts";

test("lengths from the Internet Archive are read in seconds", () => {
  assert.equal(seconds("19:39"), 1179);
  assert.equal(seconds("1:02:03"), 3723);
  assert.equal(seconds("1179.4"), 1179);
  assert.equal(seconds(""), 0);
});

test("chapters keep their order and only the files that belong to the book", () => {
  const files = [
    { name: "w_10_64kb.mp3", length: "10:00", title: "10 - Other Story" },
    { name: "w_02_64kb.mp3", length: "20:00", title: "02 - White Nights, Second Night" },
    { name: "w_01_64kb.mp3", length: "30:00", title: "01 - White Nights, First Night" },
    { name: "w_01.mp3", length: "30:00", title: "01 - White Nights, First Night" },
  ];
  const c = chaptersFrom("item", files, /White Nights/);
  assert.deepEqual(c.map((t) => t.title), ["White Nights, First Night", "White Nights, Second Night"]);
  assert.equal(c[0].src, "https://archive.org/download/item/w_01_64kb.mp3");
});

test("lessons are whole chapters, never over two hours unless one chapter is", () => {
  const ch = (m: number, i: number) => ({ title: `Ch ${i}`, src: `s${i}`, seconds: m * 60 });
  const lessons = lessonsFrom([50, 50, 30, 100, 130, 10].map(ch));
  assert.deepEqual(lessons.map((l) => l.tracks.length), [2, 1, 1, 1, 1]);
  for (const l of lessons) assert.ok(l.seconds <= LESSON_MAX || l.tracks.length === 1);
  assert.equal(lessons.flatMap((l) => l.tracks).length, 6);
  assert.equal(lessons[0].title, "Ch 0 to Ch 1");
});

test("a long episode is cut into parts of two hours or less", () => {
  const jre = PODCASTS.find((p) => p.youtube)!;
  const parts = episodeLessons(jre);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.seconds <= LESSON_MAX));
  assert.equal(parts[1].tracks[0].start, parts[0].seconds);
  assert.equal(episodeLessons(PODCASTS.find((p) => p.paid)!).length, 0);
});

test("every book and episode has a safe link and a reason to read it", () => {
  assert.equal(READING_LIST.length, 9);
  assert.equal(PODCASTS.length, 8);
  for (const x of [...READING_LIST.map((b) => b.read.url), ...PODCASTS.map((p) => p.page)]) assert.match(x, /^https:\/\//);
  for (const p of PODCASTS) assert.ok(p.mp3 || p.youtube || p.paid, p.slug);
});
