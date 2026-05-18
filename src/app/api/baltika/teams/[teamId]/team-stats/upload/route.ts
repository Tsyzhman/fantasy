import { ImportStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { parseWyscoutTeamStatsWorkbook } from "@/lib/importers/wyscout-team-stats-excel";
import { getActiveScoringModel } from "@/lib/scoring";
import { recalculateBaltikaTeamSnapshots } from "@/lib/scoring/baltika-team-form-metrics";
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
    return errorResponse("MISSING_FILE", "Upload a Wyscout Team Stats .xlsx file in the file field.", 400);
  }

  if (!upload.name.toLowerCase().endsWith(".xlsx")) {
    return errorResponse("INVALID_FILE_TYPE", "Only .xlsx Wyscout Team Stats files are supported.", 400);
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
    return errorResponse("TEAM_NOT_FOUND", "Team not found.", 404);
  }

  const seasonId = String(formData.get("seasonId") ?? team.league.seasons[0]?.id ?? "");
  if (!seasonId) {
    return errorResponse("SEASON_NOT_FOUND", "Create a season before importing team stats.", 400);
  }

  const buffer = Buffer.from(await upload.arrayBuffer());
  const fileChecksum = checksum(buffer);
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

  const teamStatsImport = await prisma.baltikaTeamStatsImport.create({
    data: {
      leagueId: team.leagueId,
      seasonId,
      teamId: team.id,
      sourceFileId: sourceFile.id,
      status: ImportStatus.PARSING
    }
  });

  const parsed = parseWyscoutTeamStatsWorkbook(
    buffer,
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

    return NextResponse.json(
      {
        importId: teamStatsImport.id,
        status: ImportStatus.ERROR,
        errors: parsed.errors,
        warnings: parsed.warnings
      },
      { status: 422 }
    );
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
  const snapshotsRecalculated = await recalculateBaltikaTeamSnapshots(prisma, Array.from(affectedTeamIds), seasonId, scoringModel);

  return NextResponse.json({
    importId: readyImport.id,
    status: readyImport.status,
    rowsCount: readyImport.rowsCount,
    fixturesCount: readyImport.fixturesCount,
    snapshotsRecalculated,
    warnings: parsed.warnings
  });
}

async function upsertBaltikaFixture(
  importId: string,
  leagueId: string,
  seasonId: string,
  fixture: ReturnType<typeof parseWyscoutTeamStatsWorkbook>["fixtures"][number]
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

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
