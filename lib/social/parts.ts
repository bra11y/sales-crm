// The post's shape and the parts to paste, safe to use in the browser.

export type Ref = { title: string; url: string };
export type Quote = { text: string; author: string; url: string };
export type DailyPost = { topic: string; slug: string; text: string; thread: string[]; quote: Quote | null; refs: Ref[]; from: string };

// The text to paste: the post, then the quote and the reference as replies.
export function postParts(p: DailyPost): string[] {
  const extra = [p.quote ? `"${p.quote.text}" (${p.quote.author})` : "", ...p.refs.map((r) => `Read more: ${r.url}`)].filter(Boolean);
  return [p.text, ...p.thread, ...extra];
}

export const xIntent = (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
