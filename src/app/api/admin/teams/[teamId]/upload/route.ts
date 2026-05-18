import { ImportStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { parseWyscoutWorkbook } from "@/lib/importers/wyscout-excel";
import { getActiveScoringModel, calculateFantasyScore, calculateValueScore } from "@/lib/scoring";
import { prisma } from "@/lib/db";
import { checksum, storeUpload } from "@/lib/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: {
    teamId: string;
  };
};

export async function POST(request: Request, { params }: Params) {
  const formData = await request.formData();
  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return errorResponse("MISSING_FILE", "Upload a Wyscout .xlsx file in the file field.", 400);
  }

  if (!upload.name.toLowerCase().endsWith(".xlsx")) {
    return errorResponse("INVALID_FILE_TYPE", "Only .xlsx Wyscout files are supported in the MVP.", 400);
  }

  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? "25");
  if (upload.size > maxUploadMb * 1024 * 1024) {
    return errorResponse("FILE_TOO_LARGE", `Uploads are limited to ${maxUploadMb} MB.`, 400);
  }

  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    include: {
      league: {
        include: {
          seasons: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      }
    }
  });

  if (!team) {
    return errorResponse("TEAM_NOT_FOUND", "Team not found.", 404);
  }

  const seasonId = String(formData.get("seasonId") ?? team.league.seasons[0]?.id ?? "");
  if (!seasonId) {
    return errorResponse("SEASON_NOT_FOUND", "Create a season before importing team data.", 400);
  }

  const buffer = Buffer.from(await upload.arrayBuffer());
  const fileChecksum = checksum(buffer);
  const duplicate = await prisma.sourceFile.findFirst({
    where: {
      checksum: fileChecksum,
      imports: {
        some: { teamId: team.id }
      }
    }
  });

  const sourceFile = await prisma.sourceFile.create({
    data: {
      originalFilename: upload.name,
      storagePath: "",
      mimeType: upload.type || null,
      sizeBytes: upload.size,
      checksum: fileChecksum
    }
  });

  const stored = await storeUpload(sourceFile.id, upload.name, buffer);
  await prisma.sourceFile.update({
    where: { id: sourceFile.id },
    data: { storagePath: stored.storagePath }
  });

  const teamImport = await prisma.teamImport.create({
    data: {
      leagueId: team.leagueId,
      seasonId,
      teamId: team.id,
      sourceFileId: sourceFile.id,
      status: ImportStatus.PARSING
    }
  });

  const parsed = parseWyscoutWorkbook(buffer, { name: team.name, aliases: team.aliases });
  if (duplicate) {
    parsed.warnings.push({
      code: "DUPLICATE_FILE",
      message: "This file has already been uploaded for this team. A new version was created anyway."
    });
  }

  if (parsed.errors.length > 0) {
    const failedImport = await prisma.teamImport.update({
      where: { id: teamImport.id },
      data: {
        status: ImportStatus.ERROR,
        detectedTeamName: parsed.detectedTeamName,
        rowsCount: parsed.rows.length,
        columnsCount: parsed.columns.length,
        errorsJson: parsed.errors as Prisma.InputJsonValue,
        warningsJson: parsed.warnings as Prisma.InputJsonValue
      }
    });

    return NextResponse.json(
      {
        importId: failedImport.id,
        status: failedImport.status,
        errors: parsed.errors,
        warnings: parsed.warnings
      },
      { status: 422 }
    );
  }

  const scoringModel = await getActiveScoringModel();
  const snapshots: Prisma.PlayerSnapshotCreateManyInput[] = parsed.rows.map((row) => {
    const fantasyScore = calculateFantasyScore(row.rawMetrics, row.positionGroup, scoringModel);
    const valueScore = calculateValueScore(fantasyScore, row.marketValue);

    return {
      teamImportId: teamImport.id,
      leagueId: team.leagueId,
      seasonId,
      teamId: team.id,
      playerName: row.playerName,
      normalizedName: row.normalizedName,
      teamName: row.teamName,
      positionRaw: row.positionRaw,
      positionGroup: row.positionGroup,
      age: row.age,
      marketValue: row.marketValue,
      contractExpires: row.contractExpires,
      matchesPlayed: row.matchesPlayed,
      minutesPlayed: row.minutesPlayed,
      goals: row.goals,
      xg: row.xg,
      assists: row.assists,
      xa: row.xa,
      birthCountry: row.birthCountry,
      passportCountry: row.passportCountry,
      foot: row.foot,
      heightCm: row.heightCm,
      weightKg: row.weightKg,
      onLoan: row.onLoan,
      fantasyScore,
      valueScore,
      rawMetrics: row.rawMetrics as Prisma.InputJsonValue
    };
  });

  if (snapshots.length > 0) {
    await prisma.playerSnapshot.createMany({ data: snapshots });
  }

  const readyImport = await prisma.teamImport.update({
    where: { id: teamImport.id },
    data: {
      status: ImportStatus.READY,
      detectedTeamName: parsed.detectedTeamName,
      rowsCount: snapshots.length,
      columnsCount: parsed.columns.length,
      errorsJson: [],
      warningsJson: parsed.warnings as Prisma.InputJsonValue
    }
  });

  return NextResponse.json({
    importId: readyImport.id,
    status: readyImport.status,
    rowsCount: readyImport.rowsCount,
    columnsCount: readyImport.columnsCount,
    detectedTeamName: readyImport.detectedTeamName,
    warnings: parsed.warnings
  });
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
