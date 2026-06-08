import { NextResponse } from "next/server";

import { cancel_running_ingestion } from "@/core_data/ingestion-jobs";
import { withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const POST = withApiHandler(async () => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  return NextResponse.json(await cancel_running_ingestion(prisma));
});
