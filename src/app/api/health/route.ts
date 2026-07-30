import { NextResponse } from "next/server";

import { isDatabaseConfigured, prisma } from "@/lib/db";
import { releaseIdentity } from "@/lib/release-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ status: "error", uptimeSeconds: uptimeSeconds(), release: releaseIdentity() }, { status: 503 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", uptimeSeconds: uptimeSeconds(), release: releaseIdentity() });
  } catch {
    return NextResponse.json({ status: "error", uptimeSeconds: uptimeSeconds(), release: releaseIdentity() }, { status: 503 });
  }
}

function uptimeSeconds() {
  return Math.round(process.uptime());
}
