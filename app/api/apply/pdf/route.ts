import { currentUserId } from "@/lib/jobs/profile";
import { cvPdf } from "@/lib/pdf/cv";

// Any document from the Apply page (CV, cover letter, proposal) as a tagged, accessible PDF.
export async function POST(request: Request) {
  if (!(await currentUserId())) return new Response("Sign in again", { status: 401 });
  const body = (await request.json().catch(() => null)) as { markdown?: unknown; title?: unknown } | null;
  const markdown = typeof body?.markdown === "string" ? body.markdown.slice(0, 60_000) : "";
  const title = typeof body?.title === "string" ? body.title.slice(0, 120) : "Document";
  if (!markdown.trim()) return new Response("Nothing to make", { status: 400 });
  const pdf = await cvPdf(markdown, title);
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "cache-control": "private, no-store" } });
}
