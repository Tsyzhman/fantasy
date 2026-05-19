import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieName } from "@/lib/auth-constants";

const publicPaths = ["/login", "/setup"];
const publicPrefixes = ["/_next", "/favicon", "/team-logos", "/mode-logos"];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
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
