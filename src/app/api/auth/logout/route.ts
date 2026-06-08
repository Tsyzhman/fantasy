import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api-handler";
import { clearCurrentUserSession } from "@/lib/auth";

export const POST = withApiHandler(async () => {
  await clearCurrentUserSession();
  return NextResponse.json({ ok: true });
});
