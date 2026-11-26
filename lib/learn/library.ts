// Your reading list and podcast list, with lessons of two hours or less to play in Able Player.
// Books come from the Internet Archive: old books from library scans, newer ones to borrow free
// through Open Library. Audio is from LibriVox (public domain) or each show's own public feed.
// Every link and length below was checked on 26 November 2026.

export const LESSON_MAX = 2 * 60 * 60;

export type Read = { kind: "free" | "borrow" | "print-disabled"; url: string };
export type ListBook = {
  slug: string;
  title: string;
  author: string;
  why: string;
  read: Read;
  cover: string;
  // A LibriVox recording on the Internet Archive, and which of its files belong to this book.
  audio?: { item: string; only?: RegExp; trim?: RegExp };
};

const ia = (id: string) => `https://archive.org/details/${id}`;
const iaCover = (id: string) => `https://archive.org/services/img/${id}`;
const ol = (work: string) => `https://openlibrary.org/works/${work}`;
const olCover = (id: number) => `https://covers.openlibrary.org/b/id/${id}-M.jpg`;

export const READING_LIST: ListBook[] = [
  {
    slug: "count-of-monte-cristo",
    title: "The Count of Monte Cristo",
    author: "Alexandre Dumas",
    why: "A man jailed for a crime he did not commit studies for 14 years, then repays the people who betrayed him with patience, not noise.",
    read: { kind: "free", url: ia("thecountofmontec01184gut") },
    cover: iaCover("count_monte_cristo_0711_librivox"),
    audio: { item: "count_monte_cristo_0711_librivox" },
  },
  {
    slug: "white-nights",
    title: "White Nights",
    author: "Fyodor Dostoevsky",
    why: "A short story of four nights and one lonely dreamer. It is about loving something without letting it own you.",
    read: { kind: "free", url: ia("in.ernet.dli.2015.94347") },
    cover: iaCover("white_nights_1012_librivox"),
    audio: { item: "white_nights_1012_librivox", only: /White Nights/i, trim: /^White Nights, A Sentimental Story from the Diary of a Dreamer,\s*/i },
  },
  {
    slug: "the-prince",
    title: "The Prince",
    author: "Niccolò Machiavelli",
    why: "A 500-year-old guide to power: how leaders win, keep and lose it, and how people read what they see.",
    read: { kind: "free", url: ia("princemac00machuoft") },
    cover: iaCover("prince_librivox"),
    audio: { item: "prince_librivox", trim: /^The Prince - /i },
  },
  {
    slug: "no-longer-human",
    title: "No Longer Human",
    author: "Osamu Dazai",
    why: "A man who feels cut off from other people learns to wear a mask, then loses track of which face is his.",
    read: { kind: "print-disabled", url: ol("OL3923952W") },
    cover: olCover(14611513),
  },
  {
    slug: "confessions-of-an-advertising-man",
    title: "Confessions of an Advertising Man",
    author: "David Ogilvy",
    why: "How Ogilvy built his agency: research the customer first, then write the ad they already want to read.",
    read: { kind: "borrow", url: ol("OL3346507W") },
    cover: olCover(6987979),
  },
  {
    slug: "scientific-advertising",
    title: "Scientific Advertising",
    author: "Claude C. Hopkins",
    why: "The 1923 rules of direct response: test everything, be specific, and let results decide what works.",
    read: { kind: "print-disabled", url: ol("OL20736174W") },
    cover: olCover(15057974),
  },
  {
    slug: "psycho-cybernetics",
    title: "Psycho-Cybernetics",
    author: "Maxwell Maltz",
    why: "A surgeon noticed new faces did not change how patients felt. This is his method for changing the self-image first.",
    read: { kind: "borrow", url: ol("OL99079W") },
    cover: olCover(14428293),
  },
  {
    slug: "thus-spoke-zarathustra",
    title: "Thus Spoke Zarathustra",
    author: "Friedrich Nietzsche",
    why: "A prophet's speeches on making your own values instead of taking the crowd's. Dense, so it suits short sessions.",
    read: { kind: "free", url: ia("thusspokezarathu00nietuoft") },
    cover: iaCover("zarathustra_0809_librivox"),
    audio: { item: "zarathustra_0809_librivox" },
  },
  {
    slug: "think-and-grow-rich",
    title: "Think and Grow Rich",
    author: "Napoleon Hill",
    why: "Hill's study of successful people: a clear aim, a burning desire, and habits of thought that turn into action.",
    read: { kind: "borrow", url: ol("OL527464W") },
    cover: olCover(14542536),
  },
];

export type Episode = {
  slug: string;
  show: string;
  title: string;
  why: string;
  seconds: number;
  page: string;
  // One of these plays in Able Player. Neither: the episode is only sold, so it links out.
  mp3?: string;
  youtube?: string;
  paid?: string;
};

const FOUNDERS = "https://podcasts.apple.com/podcast/id1141877104";

export const PODCASTS: Episode[] = [
  {
    slug: "founders-john-mackey",
    show: "Founders",
    title: "#358 I had dinner with John Mackey, founder of Whole Foods",
    why: "Mackey cared about food and quality first. The money followed the obsession, not the other way round.",
    seconds: 5660,
    page: FOUNDERS,
    mp3: "https://traffic.megaphone.fm/DSLLC7695130430.mp3?updated=1748636123",
  },
  {
    slug: "founders-accidental-billionaires",
    show: "Founders",
    title: "#14 The Accidental Billionaires: the founding of Facebook",
    why: "Speed: Zuckerberg shipped while everyone around him was still deciding whether to start.",
    seconds: 2300,
    page: FOUNDERS,
    mp3: "https://traffic.megaphone.fm/DSLLC5225592365.mp3?updated=1748636347",
  },
  {
    slug: "founders-rick-rubin",
    show: "Founders",
    title: "The Singular Life of Rick Rubin",
    why: "Rubin does not force great work. He sets up the conditions for it, then gets out of the way.",
    seconds: 4844,
    page: FOUNDERS,
    mp3: "https://traffic.megaphone.fm/DSLLC6490503344.mp3?updated=1768523099",
  },
  {
    slug: "how-to-take-over-the-world-carnegie",
    show: "How to Take Over the World",
    title: "Andrew Carnegie (Part 1)",
    why: "A poor immigrant becomes the richest man in America by putting all his eggs in one basket, then watching the basket.",
    seconds: 4025,
    page: "https://podcasts.apple.com/podcast/id1333158713",
    mp3: "https://pdst.fm/e/chrt.fm/track/47G541/pscrb.fm/rss/p/mgln.ai/e/433/claritaspod.com/measure/traffic.megaphone.fm/ATHLLC8402871023.mp3?updated=1776317798",
  },
  {
    slug: "founders-how-rockefeller-worked",
    show: "Founders",
    title: "#405 How Rockefeller Worked",
    why: "Rockefeller logged every cent from age 16. Knowing exactly what you have is the first step to growing it.",
    seconds: 3480,
    page: FOUNDERS,
    mp3: "https://traffic.megaphone.fm/DSLLC3321690021.mp3?updated=1764001725",
  },
  {
    slug: "jre-elon-musk",
    show: "The Joe Rogan Experience",
    title: "#1169 Elon Musk",
    why: "Listen for how Musk breaks a problem down to what is true, then rebuilds from there, instead of copying what exists.",
    seconds: 9422,
    page: "https://www.youtube.com/watch?v=ycPr5-27vSI",
    youtube: "ycPr5-27vSI",
  },
  {
    slug: "founders-james-dyson",
    show: "Founders",
    title: "#400 The Stubborn Genius of James Dyson",
    why: "5,127 prototypes before one worked. He stayed with the problem, not the result.",
    seconds: 4383,
    page: FOUNDERS,
    mp3: "https://traffic.megaphone.fm/DSLLC3507623381.mp3?updated=1757644112",
  },
  {
    slug: "napoleon-hills-master-key",
    show: "Napoleon Hill Foundation",
    title: "Napoleon Hill's Master Key",
    why: "The ideas of Think and Grow Rich in Hill's own voice. Sold as an audiobook; there is no free official copy.",
    seconds: 9360,
    page: "https://www.audible.co.uk/pd/B073GX86JF",
    paid: "Audible",
  },
];

export type Track = { title: string; src: string; seconds: number; start?: number };
export type Lesson = { n: number; title: string; seconds: number; tracks: Track[] };

// "19:39", "1:02:03" or "1179.4" → seconds.
export function seconds(len: unknown): number {
  const s = String(len ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const parts = s.split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return 0;
  return Math.round(parts.reduce((t, p) => t * 60 + p, 0));
}

export const clock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

export const stamp = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

type ArchiveFile = { name?: string; length?: unknown; title?: string; track?: unknown };

// The chapters of a LibriVox recording, in order, from its Internet Archive file list.
export function chaptersFrom(item: string, files: ArchiveFile[], only?: RegExp, trim?: RegExp): Track[] {
  return files
    .filter((f) => typeof f.name === "string" && f.name.endsWith("_64kb.mp3"))
    .filter((f) => !only || only.test(f.title ?? ""))
    .sort((a, b) => a.name!.localeCompare(b.name!, "en", { numeric: true }))
    .map((f) => ({
      title: (f.title ?? f.name!).replace(/^\d+\s*-\s*/, "").replace(trim ?? /$^/, "").trim(),
      src: `https://archive.org/download/${item}/${encodeURIComponent(f.name!)}`,
      seconds: seconds(f.length),
    }))
    .filter((t) => t.seconds > 0);
}

// Whole chapters, in order, packed into lessons of up to two hours. A chapter longer than that
// is a lesson of its own.
export function lessonsFrom(chapters: Track[], max = LESSON_MAX): Lesson[] {
  const out: Lesson[] = [];
  let cur: Track[] = [];
  let total = 0;
  const close = () => {
    if (!cur.length) return;
    const first = cur[0].title;
    const last = cur[cur.length - 1].title;
    out.push({ n: out.length + 1, title: cur.length > 1 ? `${first} to ${last}` : first, seconds: total, tracks: cur });
    cur = [];
    total = 0;
  };
  for (const c of chapters) {
    if (cur.length && total + c.seconds > max) close();
    cur.push(c);
    total += c.seconds;
  }
  close();
  return out;
}

// A long episode is cut into equal parts of two hours or less; each part starts where the last ended.
export function episodeLessons(e: Episode, max = LESSON_MAX): Lesson[] {
  const src = e.mp3 ?? (e.youtube ? `youtube:${e.youtube}` : "");
  if (!src) return [];
  const parts = Math.max(1, Math.ceil(e.seconds / max));
  const size = Math.ceil(e.seconds / parts);
  return Array.from({ length: parts }, (_, i) => {
    const start = i * size;
    const len = Math.min(size, e.seconds - start);
    return { n: i + 1, title: parts > 1 ? `Part ${i + 1}: ${stamp(start)} to ${stamp(start + len)}` : e.title, seconds: len, tracks: [{ title: e.title, src, seconds: e.seconds, start }] };
  });
}

export async function bookLessons(b: ListBook, fetcher: typeof fetch = fetch): Promise<{ lessons: Lesson[]; failed: boolean }> {
  if (!b.audio) return { lessons: [], failed: false };
  try {
    const res = await fetcher(`https://archive.org/metadata/${b.audio.item}/files`, { next: { revalidate: 604_800 }, signal: AbortSignal.timeout(15_000) } as RequestInit);
    if (!res.ok) return { lessons: [], failed: true };
    const body = (await res.json()) as { result?: ArchiveFile[] };
    return { lessons: lessonsFrom(chaptersFrom(b.audio.item, body.result ?? [], b.audio.only, b.audio.trim)), failed: false };
  } catch {
    return { lessons: [], failed: true };
  }
}

export const findBook = (slug: string) => READING_LIST.find((b) => b.slug === slug) ?? null;
export const findEpisode = (slug: string) => PODCASTS.find((e) => e.slug === slug) ?? null;

export const READ_LABEL: Record<Read["kind"], string> = {
  free: "Read free",
  borrow: "Borrow free",
  "print-disabled": "See where to get it",
};
export const READ_NOTE: Record<Read["kind"], string> = {
  free: "Free on the Internet Archive.",
  borrow: "Free to borrow from the Internet Archive with an Open Library account.",
  "print-disabled": "The Internet Archive lends this one only to people with a print disability. Try a library or a shop.",
};
