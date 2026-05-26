import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/database-url";

export function requireCronAccess(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cron access is not allowed." } }, { status: 403 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: { code: "DATABASE_NOT_CONFIGURED", message: "Configure DATABASE_URL before running cron jobs." } },
      { status: 503 }
    );
  }

  return null;
}
