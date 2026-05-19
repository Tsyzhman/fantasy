import { ImportStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    importId: string;
  }>;
};

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const { importId } = await params;
  const teamImport = await prisma.teamImport.findUnique({
    where: { id: importId },
    include: {
      _count: {
        select: { snapshots: true }
      }
    }
  });

  if (!teamImport) {
    return errorResponse("IMPORT_NOT_FOUND", "Import not found.", 404);
  }

  if (teamImport.status !== ImportStatus.READY && teamImport.status !== ImportStatus.PUBLISHED) {
    return errorResponse("IMPORT_NOT_READY", "Only READY imports can be published.", 400);
  }

  if (teamImport._count.snapshots === 0) {
    return errorResponse("EMPTY_IMPORT", "Cannot publish an import with no player snapshots.", 400);
  }

  const published = await prisma.$transaction(async (tx) => {
    await tx.teamImport.updateMany({
      where: {
        teamId: teamImport.teamId,
        seasonId: teamImport.seasonId,
        isCurrentPublished: true,
        NOT: { id: teamImport.id }
      },
      data: {
        isCurrentPublished: false,
        status: ImportStatus.ARCHIVED
      }
    });

    return tx.teamImport.update({
      where: { id: teamImport.id },
      data: {
        status: ImportStatus.PUBLISHED,
        isCurrentPublished: true,
        publishedAt: new Date()
      }
    });
  });

  return NextResponse.json({
    importId: published.id,
    status: published.status,
    publishedAt: published.publishedAt
  });
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
