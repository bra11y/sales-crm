// YouTube links and transcripts. The app only uses YouTube's official oEmbed for the title and
// thumbnail. The words come from you: pasted from "Show transcript", read by the extension in
// your own browser, or written by Whisper from a file you upload.

export type VideoInfo = { id: string; url: string; title: string; channel: string; thumbnail: string | null };

const ID = /^[A-Za-z0-9_-]{11}$/;

// "https://youtu.be/abc…", "youtube.com/watch?v=…", "/shorts/…", "/live/…", "/embed/…" -> the 11-letter id.
export function videoId(input: string): string | null {
  const raw = input.trim();
  if (ID.test(raw)) return raw;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") return ID.test(u.pathname.slice(1, 12)) ? u.pathname.slice(1, 12) : null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  const v = u.searchParams.get("v");
  if (v && ID.test(v)) return v;
  const m = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const oembedUrl = (id: string) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(id))}`;

export function parseOembed(id: string, body: unknown): VideoInfo {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const thumb = typeof o.thumbnail_url === "string" && o.thumbnail_url.startsWith("https://") ? o.thumbnail_url : null;
  return {
    id,
    url: watchUrl(id),
    title: String(o.title ?? "").slice(0, 300) || "YouTube video",
    channel: String(o.author_name ?? "").slice(0, 200),
    thumbnail: thumb,
  };
}

export async function videoInfo(id: string, fetcher: typeof fetch = fetch): Promise<VideoInfo> {
  try {
    const res = await fetcher(oembedUrl(id), { signal: AbortSignal.timeout(10_000) });
    if (res.ok) return parseOembed(id, await res.json());
  } catch {}
  return parseOembed(id, {});
}

const STAMP = /^\(?\d{1,2}(?::\d{2}){1,2}\)?$/;
const SPOKEN_TIME = /^(\d+ (hours?|minutes?|seconds?),? ?)+$/i;
const SOUND = /\[(music|applause|laughter|laughs|inaudible|silence|foreign|__)\]|♪+/gi;

// Text copied from YouTube's "Show transcript" panel: drop time stamps, spoken time labels
// ("1 minute, 5 seconds"), sound tags and chapter titles that repeat, then join it into prose.
export function cleanTranscript(text: string): string {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\(?\d{1,2}(?::\d{2}){1,2}\)?\s+/, "").trim())
    .filter((l) => l && !STAMP.test(l) && !SPOKEN_TIME.test(l) && !/^(transcript|search in video|show transcript|chapters?)$/i.test(l));
  return lines
    .join(" ")
    .replace(SOUND, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
