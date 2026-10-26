import { type NextRequest, NextResponse } from "next/server";
import { allowed, asRole, homeFor, permissionFor } from "@/lib/auth/permissions";
import { updateSession } from "@/lib/supabase/proxy-session";

const PUBLIC = ["/login", "/login/forgot", "/auth/callback"];

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  if (code && pathname !== "/auth/callback") {
    const url = new URL("/auth/callback", request.url);
    url.searchParams.set("code", code);
    url.searchParams.set("next", "/login/new-password");
    return NextResponse.redirect(url);
  }
  const { response, signedIn, role } = await updateSession(request);
  if (!signedIn && !PUBLIC.includes(pathname)) return NextResponse.redirect(new URL("/login", request.url));
  if (signedIn && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
  // Pages check the role; API routes check the session themselves and row-level security guards the data.
  if (signedIn && !pathname.startsWith("/api/") && !/\.[a-z0-9]+$/i.test(pathname) && permissionFor(pathname) !== "open") {
    const r = asRole(await role());
    if (!allowed(r, pathname)) {
      const home = new URL(homeFor(r), request.url);
      // Landing on the home page is not a refusal; any other page says why you moved.
      if (pathname !== "/") home.searchParams.set("denied", pathname);
      return NextResponse.redirect(home);
    }
  }
  return response();
}

export const config = {
  matcher: [
    "/((?!api/ingest|api/jobs/cron|api/jobs/tick|api/ext/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|icons/|robots.txt|sitemap.xml|llms.txt|assets/).*)",
  ],
};
