// Free, legal books and guides for each field, and a search of Open Library limited to books you
// can read or borrow free. Every link below was checked on 6 November 2026.

export const FIELDS = ["accessibility", "frontend", "design", "software", "career"] as const;
export type Field = (typeof FIELDS)[number];
export const FIELD_LABEL: Record<Field, string> = {
  accessibility: "Accessibility",
  frontend: "Front-end",
  design: "Design",
  software: "Software and IT",
  career: "Career and job search",
};

export type Access = "free" | "borrow";
export type CatalogBook = { title: string; author: string; url: string; why: string; access: Access; field: Field; cover: string | null; key: string };

const book = (field: Field, title: string, author: string, url: string, why: string): CatalogBook => ({ field, title, author, url, why, access: "free", cover: null, key: url });

export const FREE_BOOKS: CatalogBook[] = [
  book("accessibility", "Inclusive Components", "Heydon Pickering", "https://inclusive-components.design", "How to build menus, tabs, cards and toggles that work for everyone, with code."),
  book("accessibility", "ARIA Authoring Practices Guide", "W3C", "https://www.w3.org/WAI/ARIA/apg/", "The reference patterns for accessible widgets, with keyboard rules for each."),
  book("accessibility", "Inclusive Design Toolkit", "Microsoft", "https://inclusive.microsoft.design", "Short guides on designing with people with disabilities, not for them."),
  book("accessibility", "Resilient Web Design", "Jeremy Keith", "https://resilientwebdesign.com", "Why building on plain HTML first makes sites that last and include more people."),
  book("frontend", "Eloquent JavaScript", "Marijn Haverbeke", "https://eloquentjavascript.net", "JavaScript from the ground up, with exercises you can run in the browser."),
  book("frontend", "You Don't Know JS Yet", "Kyle Simpson", "https://github.com/getify/You-Dont-Know-JS", "How JavaScript really works: scope, closures, objects and types."),
  book("frontend", "MDN: Learn web development", "Mozilla", "https://developer.mozilla.org/en-US/docs/Learn_web_development", "A full course in HTML, CSS and JavaScript from the people who document the web."),
  book("frontend", "Learn CSS", "web.dev (Google)", "https://web.dev/learn/css", "Modern CSS layout, grid, flexbox and more, one short module at a time."),
  book("design", "Practical Typography", "Matthew Butterick", "https://practicaltypography.com", "Clear rules for type that make any page easier to read."),
  book("design", "Laws of UX", "Jon Yablonski", "https://lawsofux.com", "The psychology behind good interfaces, one principle per page."),
  book("design", "Shape Up", "Ryan Singer (Basecamp)", "https://basecamp.com/shapeup", "How a product team shapes, bets on and ships work in six-week cycles."),
  book("software", "Pro Git", "Scott Chacon and Ben Straub", "https://git-scm.com/book/en/v2", "Everything about Git, from your first commit to fixing a bad merge."),
  book("software", "Think Python", "Allen B. Downey", "https://greenteapress.com/wp/think-python-2e/", "A gentle first book on programming, using Python."),
  book("software", "Software Engineering at Google", "Titus Winters and others", "https://abseil.io/resources/swe-book", "How a large team tests, reviews and maintains code over years."),
  book("software", "The Missing Semester", "MIT", "https://missing.csail.mit.edu", "The tools school skips: the shell, editors, Git, debugging."),
  book("software", "Open Data Structures", "Pat Morin", "https://opendatastructures.org", "Lists, trees and hash tables explained, for interviews and real work."),
  book("career", "Developer Roadmaps", "roadmap.sh", "https://roadmap.sh", "Step-by-step maps of what to learn next for each tech role."),
  book("career", "Coding Interview University", "John Washam", "https://github.com/jwasham/coding-interview-university", "A full study plan for software engineering interviews."),
  book("career", "freeCodeCamp", "freeCodeCamp", "https://www.freecodecamp.org/learn", "Free certificates in web design, JavaScript and more, built from projects."),
];

// Search words for Open Library, per field.
export const FIELD_SEARCH: Record<Field, string> = {
  accessibility: "web accessibility",
  frontend: "javascript",
  design: "user experience design",
  software: "software engineering",
  career: "career development",
};

// The job tracks in a Profile map onto the fields here.
export function fieldsForTracks(tracks: string[]): Field[] {
  const map: Record<string, Field> = { accessibility: "accessibility", frontend: "frontend", design: "design", software: "software" };
  const have = new Set(tracks.map((t) => map[t]).filter(Boolean));
  return [...FIELDS.filter((f) => f !== "career" && have.has(f)), "career"];
}

export function openLibraryUrl(words: string, limit = 12): string {
  const q = `${words.trim().slice(0, 100)} ebook_access:[borrowable TO *]`;
  const p = new URLSearchParams({ q, fields: "key,title,author_name,first_publish_year,cover_i,ebook_access", limit: String(limit) });
  return `https://openlibrary.org/search.json?${p}`;
}

export function parseOpenLibrary(body: unknown, field: Field): CatalogBook[] {
  const docs = (body as { docs?: unknown[] })?.docs;
  if (!Array.isArray(docs)) return [];
  return docs
    .map((d) => d as Record<string, unknown>)
    .filter((d) => typeof d.key === "string" && /^\/works\/OL\d+W$/.test(d.key as string) && typeof d.title === "string")
    .filter((d) => d.ebook_access === "public" || d.ebook_access === "borrowable")
    .map((d) => {
      const year = Number(d.first_publish_year) || null;
      const access: Access = d.ebook_access === "public" ? "free" : "borrow";
      return {
        field,
        title: String(d.title).slice(0, 200),
        author: (Array.isArray(d.author_name) ? d.author_name.slice(0, 2).join(" and ") : "").slice(0, 200),
        url: `https://openlibrary.org${d.key}`,
        why: `${year ? `First published ${year}. ` : ""}${access === "free" ? "Free to read on Open Library." : "Free to borrow with an Open Library account."}`,
        access,
        cover: Number.isInteger(d.cover_i) ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        key: String(d.key),
      };
    });
}

export const BOOK_STATUSES = ["want", "reading", "done"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];
export const BOOK_STATUS_LABEL: Record<BookStatus, string> = { want: "Want to read", reading: "Reading", done: "Finished" };
