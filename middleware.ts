import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieName } from "@/lib/auth-constants";
import { isDatabaseConfigured } from "@/lib/database-url";

const publicPaths = ["/login", "/setup", "/api/auth/logout", "/api/health"];
const publicPrefixes = ["/_next", "/favicon", "/team-logos", "/mode-logos", "/api/cron/"];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith("/api/") && !isDatabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "DATABASE_NOT_CONFIGURED", message: "Configure DATABASE_URL before using the API." } },
      { status: 503 }
    );
  }

  const hasSession = Boolean(request.cookies.get(sessionCookieName)?.value);
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"]
};

function isPublicPath(pathname: string) {
  return publicPaths.includes(pathname) || publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}
