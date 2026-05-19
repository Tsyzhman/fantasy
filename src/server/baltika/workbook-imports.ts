import { ImportStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { parseWyscoutWorkbook } from "@/lib/importers/wyscout-excel";
import { parseWyscoutTeamStatsWorkbook } from "@/lib/importers/wyscout-team-stats-excel";
import {
  calculateAlternativeScore,
  calculateFantasyScore,
  calculateScoringScore,
  calculateValueScore,
  getActiveScoringModel
} from "@/lib/scoring";
import {
  buildBaltikaTeamFormulaMetrics,
  recalculateBaltikaTeamSnapshots
} from "@/lib/scoring/baltika-team-form-metrics";
import { checksum, storeUpload } from "@/lib/storage/local";

export type WorkbookUploadInput = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  seasonId?: string | null;
};

export type WorkbookImportResult =
  | {
      ok: true;
      status: number;
      payload: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      payload: Record<string, unknown>;
    };

export async function importWyscoutPlayersForTeam(teamId: string, upload: WorkbookUploadInput): Promise<WorkbookImportResult> {
  const invalidUpload = validateXlsxUpload(upload.fileName, upload.sizeBytes, "Wyscout");
  if (invalidUpload) return invalidUpload;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
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
    return errorResult("TEAM_NOT_FOUND", "Team not found.", 404);
  }

  const seasonId = String(upload.seasonId || team.league.seasons[0]?.id || "");
  if (!seasonId) {
    return errorResult("SEASON_NOT_FOUND", "Create a season before importing team data.", 400);
  }

  const fileChecksum = checksum(upload.buffer);
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
      originalFilename: upload.fileName,
      storagePath: "",
      mimeType: upload.mimeType || null,
      sizeBytes: upload.sizeBytes,
      checksum: fileChecksum
    }
  });

  const stored = await storeUpload(sourceFile.id, upload.fileName, upload.buffer);
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

  const parsed = await parseWyscoutWorkbook(upload.buffer, { name: team.name });
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

    return {
      ok: false,
      status: 422,
      payload: {
        importId: failedImport.id,
        status: failedImport.status,
        errors: parsed.errors,
        warnings: parsed.warnings
      }
    };
  }

  const [scoringModel, teamFormulaMetrics] = await Promise.all([
    getActiveScoringModel(),
    buildBaltikaTeamFormulaMetrics(prisma, team.id, seasonId)
  ]);
  const snapshots: Prisma.PlayerSnapshotCreateManyInput[] = parsed.rows.map((row) => {
    const rawMetrics = {
      ...row.rawMetrics,
      ...teamFormulaMetrics
    };
    const fantasyScore = calculateFantasyScore(rawMetrics, row.positionGroup, scoringModel);
    const scoringScore = calculateScoringScore(rawMetrics, row.positionGroup, scoringModel);
    const alternativeScore = calculateAlternativeScore(rawMetrics, row.positionGroup, scoringModel);
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
      scoringScore,
      alternativeScore,
      valueScore,
      rawMetrics: rawMetrics as Prisma.InputJsonValue
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

  return {
    ok: true,
    status: 200,
    payload: {
      importId: readyImport.id,
      status: readyImport.status,
      rowsCount: readyImport.rowsCount,
      columnsCount: readyImport.columnsCount,
      detectedTeamName: readyImport.detectedTeamName,
      warnings: parsed.warnings
    }
  };
}

export async function importWyscoutTeamStatsForTeam(teamId: string, upload: WorkbookUploadInput): Promise<WorkbookImportResult> {
  const invalidUpload = validateXlsxUpload(upload.fileName, upload.sizeBytes, "Wyscout Team Stats");
  if (invalidUpload) return invalidUpload;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      league: {
        include: {
          teams: true,
          seasons: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      }
    }
  });

  if (!team) {
    return errorResult("TEAM_NOT_FOUND", "Team not found.", 404);
  }

  const seasonId = String(upload.seasonId || team.league.seasons[0]?.id || "");
  if (!seasonId) {
    return errorResult("SEASON_NOT_FOUND", "Create a season before importing team stats.", 400);
  }

  const fileChecksum = checksum(upload.buffer);
  const sourceFile = await prisma.sourceFile.create({
    data: {
      originalFilename: upload.fileName,
      storagePath: "",
      mimeType: upload.mimeType || null,
      sizeBytes: upload.sizeBytes,
      checksum: fileChecksum
    }
  });

  const stored = await storeUpload(sourceFile.id, upload.fileName, upload.buffer);
  await prisma.sourceFile.update({
    where: { id: sourceFile.id },
    data: { storagePath: stored.storagePath }
  });

  const teamStatsImport = await prisma.baltikaTeamStatsImport.create({
    data: {
      leagueId: team.leagueId,
      seasonId,
      teamId: team.id,
      sourceFileId: sourceFile.id,
      status: ImportStatus.PARSING
    }
  });

  const parsed = await parseWyscoutTeamStatsWorkbook(
    upload.buffer,
    { id: team.id, name: team.name, aliases: team.aliases },
    team.league.teams.map((leagueTeam) => ({
      id: leagueTeam.id,
      name: leagueTeam.name,
      aliases: leagueTeam.aliases
    }))
  );

  if (parsed.errors.length > 0) {
    await prisma.baltikaTeamStatsImport.update({
      where: { id: teamStatsImport.id },
      data: {
        status: ImportStatus.ERROR,
        rowsCount: 0,
        fixturesCount: 0,
        errorsJson: parsed.errors as Prisma.InputJsonValue,
        warningsJson: parsed.warnings as Prisma.InputJsonValue
      }
    });

    return {
      ok: false,
      status: 422,
      payload: {
        importId: teamStatsImport.id,
        status: ImportStatus.ERROR,
        errors: parsed.errors,
        warnings: parsed.warnings
      }
    };
  }

  let fixturesSaved = 0;
  const affectedTeamIds = new Set<string>();

  for (const fixture of parsed.fixtures) {
    const savedFixture = await upsertBaltikaFixture(teamStatsImport.id, team.leagueId, seasonId, fixture);
    await prisma.baltikaTeamMatchStat.deleteMany({ where: { fixtureId: savedFixture.id } });

    const stats = fixture.rows
      .filter((row) => row.teamId)
      .map((row) => ({
        fixtureId: savedFixture.id,
        teamId: row.teamId as string,
        opponentTeamId: row.opponentTeamId,
        side: row.side,
        goals: row.goals,
        xg: row.xg,
        xga: row.xga,
        shots: row.shots,
        shotsOnTarget: row.shotsOnTarget,
        raw: row.rawMetrics as Prisma.InputJsonValue
      }));

    for (const stat of stats) {
      affectedTeamIds.add(stat.teamId);
      if (stat.opponentTeamId) affectedTeamIds.add(stat.opponentTeamId);
    }

    if (stats.length > 0) {
      await prisma.baltikaTeamMatchStat.createMany({ data: stats });
    }

    fixturesSaved += 1;
  }

  const readyImport = await prisma.baltikaTeamStatsImport.update({
    where: { id: teamStatsImport.id },
    data: {
      status: ImportStatus.PUBLISHED,
      rowsCount: parsed.fixtures.length * 2,
      fixturesCount: fixturesSaved,
      errorsJson: [],
      warningsJson: parsed.warnings as Prisma.InputJsonValue
    }
  });
  const scoringModel = await getActiveScoringModel();
  const snapshotsRecalculated = await recalculateBaltikaTeamSnapshots(
    prisma,
    Array.from(affectedTeamIds),
    seasonId,
    scoringModel
  );

  return {
    ok: true,
    status: 200,
    payload: {
      importId: readyImport.id,
      status: readyImport.status,
      rowsCount: readyImport.rowsCount,
      fixturesCount: readyImport.fixturesCount,
      snapshotsRecalculated,
      warnings: parsed.warnings
    }
  };
}

async function upsertBaltikaFixture(
  importId: string,
  leagueId: string,
  seasonId: string,
  fixture: Awaited<ReturnType<typeof parseWyscoutTeamStatsWorkbook>>["fixtures"][number]
) {
  const existing = await prisma.baltikaFixture.findFirst({
    where: {
      leagueId,
      seasonId,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeTeamName: fixture.homeTeamName,
      awayTeamName: fixture.awayTeamName,
      kickoffAt: fixture.kickoffAt
    }
  });

  const data = {
    importId,
    leagueId,
    seasonId,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeTeamName: fixture.homeTeamName,
    awayTeamName: fixture.awayTeamName,
    kickoffAt: fixture.kickoffAt,
    competition: fixture.competition,
    durationMinutes: fixture.durationMinutes,
    status: "PLAYED",
    source: "WYSCOUT_TEAM_STATS",
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    homeXg: fixture.homeXg,
    awayXg: fixture.awayXg,
    raw: fixture.raw as Prisma.InputJsonValue
  };

  if (existing) {
    return prisma.baltikaFixture.update({
      where: { id: existing.id },
      data
    });
  }

  return prisma.baltikaFixture.create({ data });
}

function validateXlsxUpload(fileName: string, sizeBytes: number, label: string) {
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return errorResult("INVALID_FILE_TYPE", `Only .xlsx ${label} files are supported.`, 400);
  }

  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? "25");
  if (sizeBytes > maxUploadMb * 1024 * 1024) {
    return errorResult("FILE_TOO_LARGE", `Uploads are limited to ${maxUploadMb} MB.`, 400);
  }

  return null;
}

function errorResult(code: string, message: string, status: number): WorkbookImportResult {
  return {
    ok: false,
    status,
    payload: { error: { code, message } }
  };
}
