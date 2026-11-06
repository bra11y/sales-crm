"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { addFileNote, addTextNote, addVideoNote } from "@/app/(crm)/notes/actions";
import { videoId } from "@/lib/learn/youtube";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export const FIELD =
  "w-full rounded-xl border border-line-strong bg-secondary px-3 h-11 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger";
export const AREA =
  "w-full rounded-xl border border-line-strong bg-secondary px-3 py-2.5 text-[15px] leading-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger";
const LABEL = "text-[15px] font-medium";
const HINT = "text-soft text-[13px] leading-normal";

const MODES = [
  { id: "video", label: "YouTube link" },
  { id: "file", label: "Upload a file" },
  { id: "text", label: "Write or paste" },
] as const;
type Mode = (typeof MODES)[number]["id"];

const MEDIA = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/flac", "video/mp4", "video/webm", "video/quicktime"];
const DOCS = ["application/pdf", "application/epub+zip"];
const TEXT = ["text/plain", "text/markdown"];
const MAX_FILE = 25 * 1024 * 1024;
// Some phones give no type for EPUB, Markdown or M4A files, so the name decides.
export function fileType(f: File): string {
  if (f.type) return f.type === "audio/x-m4a" ? "audio/mp4" : f.type;
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  return ({ epub: "application/epub+zip", pdf: "application/pdf", md: "text/markdown", txt: "text/plain", m4a: "audio/mp4", mp3: "audio/mpeg" } as Record<string, string>)[ext] ?? "";
}
// The real reason an upload failed, in plain words.
export function uploadError(message: string): string {
  if (/mime|type|not supported/i.test(message)) return "This kind of file can't be uploaded. Use one of the types listed under the box.";
  if (/size|too large|exceeded|413/i.test(message)) return "That file is too big. Use a file under 25 MB.";
  if (/row-level|policy|unauthori[sz]ed|jwt|403|401|token/i.test(message)) return "You were signed out while uploading. Sign in again, then try once more.";
  if (/fetch|network|failed to fetch|load failed|timeout/i.test(message)) return `The file did not reach the server (your browser said: "${message.slice(0, 80)}"). If the file is in iCloud or Google Drive, open it once so it downloads to this phone, then try again.`;
  return `The upload did not finish (${message.slice(0, 120)}). Try again.`;
}
const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
export const uploadPath = (userId: string, folder: string, name: string) => `${userId}/${folder}${Date.now()}-${safeName(name)}`;

export default function AddNote({ userId }: { userId: string }) {
  const id = useId();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<Mode>("video");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const f = (name: string) => `${id}-${name}`;
  const err = (name: string) =>
    errors[name]
      ? {
          "aria-invalid": true as const,
          "aria-describedby": `${f(name)}-err ${f(name)}-hint`,
        }
      : { "aria-describedby": `${f(name)}-hint` };

  function fail(field: string, message: string) {
    setErrors({ [field]: message });
    setStatus("");
    setBusy(false);
    requestAnimationFrame(() => document.getElementById(f(field))?.focus());
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "");
    setErrors({});
    setBusy(true);

    if (mode === "video") {
      if (!videoId(get("url"))) return fail("url", "Paste a YouTube link, like https://youtu.be/… or https://www.youtube.com/watch?v=…");
      setStatus("Saving the video…");
      const r = await addVideoNote({ url: get("url"), transcript: get("transcript"), body: get("body"), tags: get("tags") });
      if (!r.ok) return fail("url", r.error);
      return done(r.id, r.existed ? "This video was already in your notes. The new words were added to it." : "Saved.", r.summarise);
    }

    if (mode === "file") {
      const file = data.get("file");
      if (!(file instanceof File) || !file.size) return fail("file", "Choose a file.");
      const type = fileType(file);
      if (![...MEDIA, ...DOCS, ...TEXT].includes(type)) return fail("file", "Use a PDF, EPUB or text file, or an audio or video file (MP3, M4A, WAV, MP4, MOV).");
      if (file.size > MAX_FILE) return fail("file", "That file is over 25 MB. For a recording, save just the audio (M4A or MP3), which is much smaller.");
      if (TEXT.includes(type)) {
        const body = (await file.text()).trim();
        if (body.length < 20) return fail("file", "That file has almost no text in it.");
        setStatus("Saving…");
        const r = await addTextNote({ title: get("title") || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "), body: body.slice(0, 50_000), url: get("url"), tags: get("tags") });
        if (!r.ok) return fail("file", r.error);
        return done(r.id, "Saved.", r.summarise);
      }
      if (get("url") && !videoId(get("url"))) return fail("url", "That is not a YouTube link. Leave it empty if the file is not from YouTube.");
      setStatus("Uploading to your private folder…");
      const path = uploadPath(userId, "", file.name);
      const up = await supabaseBrowser().storage.from("learning").upload(path, file, { contentType: type, upsert: false });
      if (up.error) return fail("file", uploadError(up.error.message));
      setStatus(DOCS.includes(type) ? "Reading the text of the file…" : "Turning the speech into text. A long recording can take a minute or two…");
      const r = await addFileNote({ path, name: file.name, mime: type, title: get("title"), url: get("url"), tags: get("tags") });
      if (!r.ok) return fail("file", r.error);
      return done(r.id, "Saved. The file was deleted after its words were written.", r.summarise);
    }

    if (!get("title").trim()) return fail("title", "Give the note a title.");
    if (get("body").trim().length < 20) return fail("body", "Write or paste at least a few sentences.");
    setStatus("Saving…");
    const r = await addTextNote({ title: get("title"), body: get("body"), url: get("url"), tags: get("tags") });
    if (!r.ok) return fail("body", r.error);
    done(r.id, "Saved.", r.summarise);
  }

  function done(noteId: string, message: string, summarise: boolean) {
    setBusy(false);
    setStatus(`${message} Opening the note${summarise ? " to write its summary" : ""}…`);
    formRef.current?.reset();
    router.push(`/notes/${noteId}${summarise ? "?summarise=1" : ""}`);
  }

  const fieldError = (name: string) =>
    errors[name] ? (
      <p id={`${f(name)}-err`} role="alert" className="text-danger text-[14px]">
        {errors[name]}
      </p>
    ) : null;

  return (
    <section aria-labelledby={f("h")} className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-4 sm:p-5">
      <h2 id={f("h")} className="text-[20px] font-semibold tracking-[-0.015em]">
        Add a note
      </h2>
      <form ref={formRef} onSubmit={submit} aria-busy={busy} noValidate className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className={cn(LABEL, "mb-2")}>What are you adding?</legend>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "has-focus-visible:ring-ring inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-[14px] has-focus-visible:ring-2",
                  mode === m.id ? "border-foreground bg-foreground text-background font-medium" : "border-line-strong text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  value={m.id}
                  checked={mode === m.id}
                  onChange={() => {
                    setMode(m.id);
                    setErrors({});
                  }}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>

        {mode !== "text" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={f("url")} className={LABEL}>
              YouTube link {mode === "video" ? "(required)" : "(optional)"}
            </label>
            <input id={f("url")} name="url" type="url" inputMode="url" autoComplete="url" required={mode === "video"} className={FIELD} {...err("url")} />
            <p id={`${f("url")}-hint`} className={HINT}>
              {mode === "video" ? "Use the Share button on YouTube, or copy the address bar." : "Add it if the file came from YouTube, so the note links back to the video."}
            </p>
            {fieldError("url")}
          </div>
        )}

        {mode === "video" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={f("transcript")} className={LABEL}>
              The video&apos;s words (optional)
            </label>
            <textarea id={f("transcript")} name="transcript" rows={5} className={AREA} {...err("transcript")} />
            <div id={`${f("transcript")}-hint`} className={HINT}>
              <p>Paste the transcript to get a summary, study questions and post drafts. To copy it on YouTube:</p>
              <ol className="mt-1 list-decimal pl-5">
                <li>Under the video, open the description (“…more”).</li>
                <li>Press “Show transcript”.</li>
                <li>Select all the text in the panel, copy it, and paste it here. Time stamps are removed for you.</li>
              </ol>
              <p className="mt-1">On a computer, the extension does this for you: open the video and press “Save to Notes”.</p>
            </div>
          </div>
        )}

        {mode === "file" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={f("file")} className={LABEL}>
              File (required)
            </label>
            <input
              id={f("file")}
              name="file"
              type="file"
              accept={[...DOCS, ...TEXT, ...MEDIA, ".pdf", ".epub", ".txt", ".md", ".m4a", ".mp3"].join(",")}
              className="text-soft file:bg-secondary file:text-foreground focus-visible:ring-ring file:border-line-strong min-h-11 w-full rounded-lg text-[15px] outline-none file:mr-3 file:h-11 file:cursor-pointer file:rounded-xl file:border file:px-4 file:text-[15px] focus-visible:ring-2"
              {...err("file")}
            />
            <p id={`${f("file")}-hint`} className={HINT}>
              A PDF, EPUB or text file (an article, notes, slides saved as PDF), or a recording: MP3, M4A, WAV, MP4 or MOV, up to 25 MB. Recordings are turned into text, then deleted.
            </p>
            {fieldError("file")}
          </div>
        )}

        {mode !== "video" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={f("title")} className={LABEL}>
              Title {mode === "text" ? "(required)" : "(optional)"}
            </label>
            <input id={f("title")} name="title" type="text" required={mode === "text"} maxLength={300} className={FIELD} {...err("title")} />
            <p id={`${f("title")}-hint`} className={HINT}>
              {mode === "text" ? "What it is about, in a few words." : "Left empty, the file name is used."}
            </p>
            {fieldError("title")}
          </div>
        )}

        {mode === "text" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={f("url")} className={LABEL}>
              Link to the source (optional)
            </label>
            <input id={f("url")} name="url" type="url" inputMode="url" className={FIELD} {...err("url")} />
            <p id={`${f("url")}-hint`} className={HINT}>
              An article, a course page or a post.
            </p>
          </div>
        )}

        {mode !== "file" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={f("body")} className={LABEL}>
              {mode === "text" ? "Your note (required)" : "Your own notes (optional)"}
            </label>
            <textarea id={f("body")} name="body" rows={mode === "text" ? 8 : 3} required={mode === "text"} className={AREA} {...err("body")} />
            <p id={`${f("body")}-hint`} className={HINT}>
              {mode === "text" ? "Type, or paste an article or your class notes." : "What you want to remember or try. Kept apart from the AI's summary."}
            </p>
            {fieldError("body")}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={f("tags")} className={LABEL}>
            Tags (optional)
          </label>
          <input id={f("tags")} name="tags" type="text" autoComplete="off" className={FIELD} {...err("tags")} />
          <p id={`${f("tags")}-hint`} className={HINT}>
            Separate with commas, like: accessibility, react, interview.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="md" className="h-11 rounded-xl px-5" aria-disabled={busy}>
            {busy ? "Working…" : "Save note"}
          </Button>
          <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
            {status}
          </p>
        </div>
      </form>
    </section>
  );
}
