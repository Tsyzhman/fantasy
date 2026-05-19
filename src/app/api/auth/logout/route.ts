import { NextResponse } from "next/server";

import { clearCurrentUserSession } from "@/lib/auth";

export async function POST() {
  await clearCurrentUserSession();
  return NextResponse.json({ ok: true });
}
