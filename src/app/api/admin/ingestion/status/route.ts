import { NextResponse } from "next/server";

import { getIngestionAdminStatus } from "@/core_data/ingestion-jobs";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  return NextResponse.json(await getIngestionAdminStatus(prisma));
}

