import { createHash, timingSafeEqual } from "node:crypto";

import { jsonError } from "@/lib/api-handler";
import { isDatabaseConfigured } from "@/lib/database-url";

export function requireCronAccess(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!hasExpectedBearerSecret(authorization, expectedSecret)) {
    return jsonError("FORBIDDEN", "Cron access is not allowed.", 403);
  }

  if (!isDatabaseConfigured()) {
    return jsonError("DATABASE_NOT_CONFIGURED", "Configure DATABASE_URL before running cron jobs.", 503);
  }

  return null;
}

function hasExpectedBearerSecret(authorization: string | null, expectedSecret: string | undefined) {
  if (!expectedSecret || !authorization?.startsWith("Bearer ")) return false;

  const providedSecret = authorization.slice("Bearer ".length);
  return timingSafeEqual(hashSecret(providedSecret), hashSecret(expectedSecret));
}

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest();
}
