import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeName } from "@/lib/text";
import {
  importWyscoutPlayersForTeam,
  importWyscoutTeamStatsForTeam,
  type WorkbookImportResult
} from "@/server/baltika/workbook-imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: {
    leagueId: string;
  };
};

type TeamForMatching = {
  id: string;
  name: string;
  aliases: string[];
};

type BulkFileKind = "players" | "teamStats";

type BulkUploadResult = {
  filename: string;
  kind: BulkFileKind;
  teamId: string | null;
  teamName: string | null;
  status: "imported" | "failed";
  rowsCount?: number;
  fixturesCount?: number;
  error?: string;
  warningsCount?: number;
};

const organizationTokens = new Set(["fc", "afc", "ac", "sc", "cf", "fk", "cd", "sv", "sad", "jk", "bb"]);

export async function POST(request: Request, { params }: Params) {
  const formData = await request.formData();
  const uploads = [...formData.getAll("files"), ...formData.getAll("file")].filter((value): value is File => value instanceof File);

  if (uploads.length === 0) {
    return NextResponse.json({ error: { code: "MISSING_FILES", message: "Upload one or more .xlsx files." } }, { status: 400 });
  }

  const league = await prisma.league.findUnique({
    where: { id: params.leagueId },
    include: {
      seasons: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      teams: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          aliases: true
        }
      }
    }
  });

  if (!league) {
    return NextResponse.json({ error: { code: "LEAGUE_NOT_FOUND", message: "League not found." } }, { status: 404 });
  }

  const seasonId = String(formData.get("seasonId") ?? league.seasons[0]?.id ?? "");
  if (!seasonId) {
    return NextResponse.json({ error: { code: "SEASON_NOT_FOUND", message: "Create a season before importing files." } }, { status: 400 });
  }

  const results: BulkUploadResult[] = [];
  for (const upload of uploads) {
    const kind = detectFileKind(upload.name);
    const match = matchTeamFromFilename(upload.name, kind, league.teams);

    if (!match.team) {
      results.push({
        filename: upload.name,
        kind,
        teamId: null,
        teamName: null,
        status: "failed",
        error: match.error
      });
      continue;
    }

    try {
      const importResult =
        kind === "teamStats"
          ? await importWyscoutTeamStatsForTeam(match.team.id, {
              buffer: Buffer.from(await upload.arrayBuffer()),
              fileName: upload.name,
              mimeType: upload.type || null,
              sizeBytes: upload.size,
              seasonId
            })
          : await importWyscoutPlayersForTeam(match.team.id, {
              buffer: Buffer.from(await upload.arrayBuffer()),
              fileName: upload.name,
              mimeType: upload.type || null,
              sizeBytes: upload.size,
              seasonId
            });

      results.push(toBulkResult(upload.name, kind, match.team, importResult));
    } catch (error) {
      results.push({
        filename: upload.name,
        kind,
        teamId: match.team.id,
        teamName: match.team.name,
        status: "failed",
        error: error instanceof Error ? error.message : "Import failed."
      });
    }
  }

  const imported = results.filter((result) => result.status === "imported");
  const failed = results.filter((result) => result.status === "failed");

  return NextResponse.json(
    {
      summary: {
        total: results.length,
        imported: imported.length,
        failed: failed.length,
        playersImported: imported.filter((result) => result.kind === "players").length,
        teamStatsImported: imported.filter((result) => result.kind === "teamStats").length
      },
      results
    },
    { status: failed.length > 0 ? 207 : 200 }
  );
}

function detectFileKind(filename: string): BulkFileKind {
  return normalizeName(baseNameWithoutExtension(filename)).startsWith("team stats") ? "teamStats" : "players";
}

function matchTeamFromFilename(filename: string, kind: BulkFileKind, teams: TeamForMatching[]) {
  const candidates = teamNameCandidates(filename, kind);
  const exactIndex = createExactTeamIndex(teams);

  for (const candidate of candidates) {
    const exactTeam = uniqueTeam(exactIndex.get(normalizeName(candidate)) ?? []);
    if (exactTeam) return { team: exactTeam };
  }

  for (const candidate of candidates) {
    const stripped = stripOrganizationWords(candidate);
    const exactTeam = uniqueTeam(exactIndex.get(normalizeName(stripped)) ?? []);
    if (exactTeam) return { team: exactTeam };
  }

  for (const candidate of candidates) {
    const prefixTeam = uniqueTeam(teams.filter((team) => teamNames(team).some((name) => tokenPrefixesMatch(candidate, name))));
    if (prefixTeam) return { team: prefixTeam };
  }

  for (const candidate of candidates) {
    const tokenTeam = uniqueTeam(teams.filter((team) => teamNames(team).some((name) => candidateTokensIncludeTeam(candidate, name))));
    if (tokenTeam) return { team: tokenTeam };
  }

  return {
    team: null,
    error: `Could not match "${filename}" to a team in this league. Tried: ${candidates.join(", ")}.`
  };
}

function teamNameCandidates(filename: string, kind: BulkFileKind) {
  const base = baseNameWithoutExtension(filename);
  const withoutTeamStats = kind === "teamStats" ? base.replace(/^team\s+stats\s+/i, "") : base;
  const withoutLeagueCode = withoutTeamStats.replace(/^[A-Z]{2,4}\s+/, "");
  const values = [
    withoutTeamStats,
    withoutLeagueCode,
    stripOrganizationWords(withoutTeamStats),
    stripOrganizationWords(withoutLeagueCode)
  ];

  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function createExactTeamIndex(teams: TeamForMatching[]) {
  const index = new Map<string, TeamForMatching[]>();

  for (const team of teams) {
    for (const name of teamNames(team)) {
      const variants = [name, stripOrganizationWords(name)];
      for (const variant of variants) {
        const key = normalizeName(variant);
        if (!key) continue;
        index.set(key, [...(index.get(key) ?? []), team]);
      }
    }
  }

  return index;
}

function teamNames(team: TeamForMatching) {
  return [team.name, ...team.aliases];
}

function uniqueTeam(matches: TeamForMatching[]) {
  const unique = new Map(matches.map((team) => [team.id, team]));
  return unique.size === 1 ? Array.from(unique.values())[0] : null;
}

function tokenPrefixesMatch(candidate: string, target: string) {
  const candidateTokens = normalizeName(candidate).split(" ").filter(Boolean);
  const targetTokens = normalizeName(target).split(" ").filter(Boolean);
  if (candidateTokens.length === 0) return false;

  let targetIndex = 0;
  for (const candidateToken of candidateTokens) {
    const nextIndex = targetTokens.findIndex((targetToken, index) => index >= targetIndex && targetToken.startsWith(candidateToken));
    if (nextIndex === -1) return false;
    targetIndex = nextIndex + 1;
  }

  return true;
}

function candidateTokensIncludeTeam(candidate: string, target: string) {
  const candidateTokens = new Set(normalizeName(candidate).split(" ").filter(Boolean));
  const targetTokens = normalizeName(stripOrganizationWords(target)).split(" ").filter(Boolean);
  return targetTokens.length > 0 && targetTokens.every((token) => candidateTokens.has(token));
}

function stripOrganizationWords(value: string) {
  const tokens = normalizeName(value).split(" ").filter(Boolean);
  while (tokens.length > 1 && organizationTokens.has(tokens[0])) tokens.shift();
  while (tokens.length > 1 && organizationTokens.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

function baseNameWithoutExtension(filename: string) {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.xlsx$/i, "").trim();
}

function toBulkResult(filename: string, kind: BulkFileKind, team: TeamForMatching, result: WorkbookImportResult): BulkUploadResult {
  const warnings = Array.isArray(result.payload.warnings) ? result.payload.warnings : [];
  if (!result.ok) {
    return {
      filename,
      kind,
      teamId: team.id,
      teamName: team.name,
      status: "failed",
      error: firstErrorMessage(result.payload),
      warningsCount: warnings.length
    };
  }

  return {
    filename,
    kind,
    teamId: team.id,
    teamName: team.name,
    status: "imported",
    rowsCount: typeof result.payload.rowsCount === "number" ? result.payload.rowsCount : undefined,
    fixturesCount: typeof result.payload.fixturesCount === "number" ? result.payload.fixturesCount : undefined,
    warningsCount: warnings.length
  };
}

function firstErrorMessage(payload: Record<string, unknown>) {
  if (typeof payload.error === "object" && payload.error && "message" in payload.error) {
    return String((payload.error as { message: unknown }).message);
  }

  if (Array.isArray(payload.errors) && payload.errors[0] && typeof payload.errors[0] === "object" && "message" in payload.errors[0]) {
    return String((payload.errors[0] as { message: unknown }).message);
  }

  return "Import failed.";
}
