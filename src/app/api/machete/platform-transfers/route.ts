/** @spec spec://modules/machete/FEAT-008-platform-transfer-trends#contracts */
import { NextResponse } from "next/server";
import { jsonError, requiredSearchParam, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireKhlUser } from "@/server/khl/access";
import { loadPlatformTransferTrends } from "@/server/platform-transfer-trends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const squadModule = params.get("module") ?? "football";
  if (squadModule !== "football" && squadModule !== "khl") return jsonError("BAD_REQUEST", "Unknown squad module.", 400);
  const auth = squadModule === "khl" ? await requireKhlUser(request) : await requireApiUser(request);
  if (auth.response) return auth.response;
  const contestId = requiredSearchParam(params, "contestId").trim();
  const view = await loadPlatformTransferTrends(prisma, { contestId, module: squadModule });
  if (!view) return jsonError("NOT_FOUND", "Contest not found.", 404);
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
});
