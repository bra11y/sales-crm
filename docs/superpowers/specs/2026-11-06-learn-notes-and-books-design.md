# Learn: Notes from videos, and Books with summaries

Date: 6 November 2026. Branch: `feat/job-finder`.

## Why

People save YouTube videos and never come back to them. What they learn gets lost, and it never turns
into anything: no project, no post, no proof of growth. The app already helps a person find jobs. This
adds the other half: learn, keep what you learned, and use it.

It is for anyone with skills and a willingness to learn, not only the owner. It must work on a phone.

## Goals

1. **Notes** (`/notes`): turn a YouTube video (or any text) into a note you will use.
   - Paste a link. The app gets the title, channel and thumbnail from YouTube's official oEmbed.
   - The words of the video come from one of three honest routes:
     1. The extension's **Save to Notes** button on a YouTube page reads the transcript in your own browser.
     2. Paste the text from YouTube's **Show transcript** (works on a phone).
     3. Upload the audio or video file. Groq's Whisper writes the transcript.
   - A small AI model then writes: a short summary, key points, study questions, three social post
     drafts, content ideas and project ideas. Each has a Copy button.
   - Your own words sit beside the AI's. Tags keep notes findable. Search by words.
   - **Review**: notes come back after 1, 3, 7, 21 and 60 days so they are not forgotten. "Due today" shows first.
2. **Books** (`/books`): free books for your field, and summaries.
   - **For your field**: a hand-checked list of free, legal books per field (accessibility, front-end,
     design, software, career), plus a search of Open Library limited to books you can read free.
     Each opens where it can be read.
   - **Your books**: upload your own PDF or EPUB (private to you). PDF opens in the browser; EPUB opens
     as plain text in the app.
   - **Summary**: for your own books, the app reads the text in your browser and the AI summarises it in
     parts, then joins the parts. For catalogue books, the AI writes key ideas from what it knows, marked
     clearly as "from the AI's general knowledge, not from the book".
   - A book summary is saved as a note, so it can become a post or a project like any other note.
   - Reading status: want to read, reading, done.

## Not in this build

- Career path suggestions from CV, certificates and history (next project).
- Mobile form filling and the mobile layout pass (separate project, already agreed).
- Sharing notes with other people.

## Must never happen

- No getting around YouTube's protections (no faking YouTube's apps, no scraping tokens). Only oEmbed,
  the user's own browser, pasted text, or the user's own file.
- No pirated books. The app suggests only free, legal sources and never hands out uploaded files.
- The AI never pretends to have read a book it has not read.
- Nothing breaks when AI is off or out of credit: notes still save, with a plain message.

## Choices made (my calls)

- AI: the existing provider list (`lib/apply/ai.ts`), Groq first, Vercel AI Gateway as backup.
  `NVIDIA_API_KEY` is added as a second free provider for long book work.
- Storage: a private `learning` bucket, one folder per person, like `documents`. 25 MB per file (Groq's limit).
- PDF text is read in the browser with `pdfjs-dist`, so large files never pass through a Vercel function
  (4.5 MB body limit). EPUB is read with the zip reader in `lib/import/unzip.ts`.
- Audio goes browser → Supabase storage → server → Groq Whisper.
- Long text is summarised in parts of about 12,000 characters, at most 12 parts, so a free-tier key copes.
- Sidebar gets a **Learn** section with Notes and Books, for every role.
- Tables: `notes` and `books`, owner-only row-level security, like `documents`.
