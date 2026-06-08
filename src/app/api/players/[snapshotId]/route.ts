import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { jsonError, requiredStringParam, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObjectOrNull } from "@/lib/request-json";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    snapshotId: string;
  }>;
};

export const PATCH = withApiHandler(async (request: Request, { params }: Params) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const snapshotId = requiredStringParam((await params).snapshotId, "snapshotId");
  const payload = await readJsonObjectOrNull(request);

  if (!payload || typeof payload.isStarter !== "boolean") {
    return jsonError("INVALID_PAYLOAD", "isStarter must be a boolean.", 400);
  }

  try {
    const snapshot = await prisma.playerSnapshot.update({
      where: { id: snapshotId },
      data: { isStarter: payload.isStarter },
      select: {
        id: true,
        isStarter: true
      }
    });

    return NextResponse.json({ player: snapshot });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return jsonError("PLAYER_NOT_FOUND", "Player snapshot not found.", 404);
    }

    throw error;
  }
});
