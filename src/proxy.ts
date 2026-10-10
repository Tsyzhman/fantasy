/** @spec spec://common/INFRA-006-continuous-deployment#observability */
import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieName } from "@/lib/auth-constants";
import { isDatabaseConfigured } from "@/lib/database-url";

const publicPaths = [
  "/login",
  "/setup",
  "/api/auth/logout",
  "/api/browser-extension/sports-squad",
  "/api/health",
  "/api/client-errors"
];
const publicPrefixes = ["/_next", "/favicon", "/team-logos", "/mode-logos", "/api/cron/", "/api/health/", "/api/telegram/"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const suppliedId = request.headers.get("x-request-id");
  const requestId = suppliedId && /^[a-f0-9-]{36}$/i.test(suppliedId) ? suppliedId : crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);
  const finish = (response: NextResponse) => {
    response.headers.set("X-Request-ID", requestId);
    if (process.env.APP_RELEASE_COMMIT) response.headers.set("X-Release-Commit", process.env.APP_RELEASE_COMMIT);
    return response;
  };

  if (isPublicPath(pathname)) {
    return finish(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (pathname.startsWith("/api/") && !isDatabaseConfigured()) {
    return finish(NextResponse.json(
      { error: { code: "DATABASE_NOT_CONFIGURED", message: "Configure DATABASE_URL before using the API." } },
      { status: 503 }
    ));
  }

  const hasSession = Boolean(request.cookies.get(sessionCookieName)?.value);
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return finish(NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }, { status: 401 }));
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return finish(NextResponse.redirect(loginUrl));
  }

  return finish(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"]
};

function isPublicPath(pathname: string) {
  return publicPaths.includes(pathname) || publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}
