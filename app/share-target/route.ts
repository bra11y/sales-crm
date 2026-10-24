import { NextResponse } from "next/server";

// Normally the service worker answers shares. This only runs if it is not installed yet:
// links and text still arrive; a shared image cannot be kept, so the page asks for it again.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const to = new URL("/jobs/add", request.url);
  const text = [form?.get("title"), form?.get("text")].filter(Boolean).join("\n").slice(0, 4000);
  const link = String(form?.get("url") ?? "").slice(0, 1000);
  if (text) to.searchParams.set("text", text);
  if (link) to.searchParams.set("link", link);
  const shot = form?.get("shot");
  if (shot instanceof File && shot.size) to.searchParams.set("missed", "1");
  return NextResponse.redirect(to, 303);
}

export function GET(request: Request) {
  const from = new URL(request.url);
  const to = new URL("/jobs/add", request.url);
  for (const k of ["text", "link"]) if (from.searchParams.get(k)) to.searchParams.set(k, from.searchParams.get(k)!.slice(0, 4000));
  return NextResponse.redirect(to, 303);
}
