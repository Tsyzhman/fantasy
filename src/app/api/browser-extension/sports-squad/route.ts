import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireBrowserExtensionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  loadSportsRuExtensionTransferPlan,
  SportsRuExtensionTransferError
} from "@/machete/sports_ru_extension_transfer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireBrowserExtensionUser(request);
  if (auth.response) return noStore(auth.response);

  const tournamentHru = new URL(request.url).searchParams.get("tournamentHru")?.trim() ?? "";
  try {
    const plan = await loadSportsRuExtensionTransferPlan(prisma, {
      userId: auth.user.id,
      tournamentHru
    });
    return noStore(NextResponse.json({ plan }));
  } catch (error) {
    if (error instanceof SportsRuExtensionTransferError) {
      return noStore(jsonError(error.code, error.message, error.status));
    }
    throw error;
  }
});

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Authorization");
  return response;
}
