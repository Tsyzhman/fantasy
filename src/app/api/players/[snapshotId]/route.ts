import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    snapshotId: string;
  };
};

export async function PATCH(request: Request, { params }: Params) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload.isStarter !== "boolean") {
    return NextResponse.json({ error: { code: "INVALID_PAYLOAD", message: "isStarter must be a boolean." } }, { status: 400 });
  }

  try {
    const snapshot = await prisma.playerSnapshot.update({
      where: { id: params.snapshotId },
      data: { isStarter: payload.isStarter },
      select: {
        id: true,
        isStarter: true
      }
    });

    return NextResponse.json({ player: snapshot });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: { code: "PLAYER_NOT_FOUND", message: "Player snapshot not found." } }, { status: 404 });
    }

    throw error;
  }
}
