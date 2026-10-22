import { type NextRequest, NextResponse } from "next/server";
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
  const { response, signedIn } = await updateSession(request);
  if (!signedIn && !PUBLIC.includes(pathname)) return NextResponse.redirect(new URL("/login", request.url));
  if (signedIn && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!api/ingest|api/jobs/cron|api/jobs/tick|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml|llms.txt|assets/).*)"],
};
