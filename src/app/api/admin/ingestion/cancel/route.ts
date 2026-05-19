import { NextResponse } from "next/server";

import { cancel_running_ingestion } from "@/core_data/ingestion-jobs";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  return NextResponse.json(await cancel_running_ingestion(prisma));
}

