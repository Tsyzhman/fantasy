// Generate a FotMob-based Penalty Potential Index ranking from match_player_stats.
//
// Usage:
//   tsx scripts/penalty-potential-index.ts
//   tsx scripts/penalty-potential-index.ts --league=47 --season=2025/2026 --min-minutes=600 --limit=40
//   tsx scripts/penalty-potential-index.ts --json

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient, type Prisma } from "@prisma/client";

import { parse_payload } from "../src/core_data/parsers";
import {
  aggregatePenaltyPotentialRows,
  analyzePenaltyPotentialRows,
  findUnderratedPenaltyCandidates,
  PENALTY_POTENTIAL_DEFAULTS,
  type PenaltyPotentialDiagnostics,
  type PenaltyPotentialResearch,
  type PenaltyPotentialRow,
  type PenaltyPotentialSourceStat
} from "../src/scoring/machete/penalty-potential-index";

type CliOptions = {
  minMinutes: number;
  limit: number;
  underratedLimit: number;
  leagueId: bigint | null;
  season: string | null;
  payloadDir: string | null;
  json: boolean;
};

void main().catch((error) => {
  console.error("[ppi] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  loadDotEnv();
  const options = parseCliOptions(process.argv.slice(2));

  if (!options.payloadDir && !process.env.DATABASE_URL) {
    console.error("[ppi] DATABASE_URL is not set. Run inside the app container or set DATABASE_URL locally.");
    console.error("[ppi] For raw JSON smoke data, use --payload-dir=tmp_fotmob_smoke.");
    process.exitCode = 1;
    return;
  }

  if (options.payloadDir) {
    const sourceStats = loadFotMobPayloadDirectoryStats(options.payloadDir, options);
    const result = aggregatePenaltyPotentialRows(sourceStats, { minMinutes: options.minMinutes });
    const research = analyzePenaltyPotentialRows(result.rows);
    const underrated = findUnderratedPenaltyCandidates(result.rows);

    if (options.json) {
      console.info(JSON.stringify({ options: jsonOptions(options), diagnostics: result.diagnostics, rows: result.rows, underrated, research }, null, 2));
      return;
    }

    printHeader(options, sourceStats.length, result.diagnostics);
    printRows("Top Penalty Potential Index", result.rows.slice(0, options.limit), result.diagnostics.penaltiesWonAvailable);

    const underratedRows = result.diagnostics.penaltiesWonAvailable ? underrated : result.rows.filter((row) => row.penaltyPotentialIndex >= 1);
    printRows(
      result.diagnostics.penaltiesWonAvailable
        ? "Underrated candidates: high PPI, low penalties won"
        : "Underrated candidates: penalties-won field unavailable, showing high PPI",
      underratedRows.slice(0, options.underratedLimit),
      result.diagnostics.penaltiesWonAvailable
    );

    printResearch(research, result.diagnostics);
    printMethodNotes();
    return;
  }

  const prisma = new PrismaClient();
  try {
    const sourceStats = await loadFotMobSourceStats(prisma, options);
    const result = aggregatePenaltyPotentialRows(sourceStats, { minMinutes: options.minMinutes });
    const research = analyzePenaltyPotentialRows(result.rows);
    const underrated = findUnderratedPenaltyCandidates(result.rows);

    if (options.json) {
      console.info(JSON.stringify({ options: jsonOptions(options), diagnostics: result.diagnostics, rows: result.rows, underrated, research }, null, 2));
      return;
    }

    printHeader(options, sourceStats.length, result.diagnostics);
    printRows("Top Penalty Potential Index", result.rows.slice(0, options.limit), result.diagnostics.penaltiesWonAvailable);

    const underratedRows = result.diagnostics.penaltiesWonAvailable ? underrated : result.rows.filter((row) => row.penaltyPotentialIndex >= 1);
    printRows(
      result.diagnostics.penaltiesWonAvailable
        ? "Underrated candidates: high PPI, low penalties won"
        : "Underrated candidates: penalties-won field unavailable, showing high PPI",
      underratedRows.slice(0, options.underratedLimit),
      result.diagnostics.penaltiesWonAvailable
    );

    printResearch(research, result.diagnostics);
    printMethodNotes();
  } finally {
    await prisma.$disconnect();
  }
}

function loadFotMobPayloadDirectoryStats(rawDir: string, options: CliOptions): PenaltyPotentialSourceStat[] {
  const dir = resolve(process.cwd(), rawDir);
  if (!existsSync(dir)) throw new Error(`Payload directory not found: ${dir}`);

  const stats: PenaltyPotentialSourceStat[] = [];
  const files = readdirSync(dir).filter((file) => /^match-.*\.json$/i.test(file));
  for (const file of files) {
    const payload = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as unknown;
    const parsed = parse_payload(payload);
    if (options.leagueId && parsed.match.leagueId !== options.leagueId) continue;
    if (options.season && parsed.match.season !== options.season) continue;

    const players = new Map(parsed.players.map((player) => [String(player.id), player.name]));
    const teams = new Map(parsed.teams.map((team) => [String(team.id), team.name]));
    const league = parsed.leagues[0] ?? null;

    for (const row of parsed.playerStats) {
      stats.push({
        playerId: row.playerId,
        player: players.get(String(row.playerId)) ?? `FotMob player ${String(row.playerId)}`,
        teamId: row.teamId,
        team: row.teamId ? teams.get(String(row.teamId)) ?? `FotMob team ${String(row.teamId)}` : "Unknown team",
        leagueId: league?.id ?? parsed.match.leagueId,
        league: league?.name ?? (parsed.match.leagueId ? `League ${String(parsed.match.leagueId)}` : null),
        season: parsed.match.season,
        position: row.position,
        minutes: row.minutes,
        statsPayload: row.statsPayload
      });
    }
  }
  return stats;
}

async function loadFotMobSourceStats(prisma: PrismaClient, options: CliOptions): Promise<PenaltyPotentialSourceStat[]> {
  const where: Prisma.MatchPlayerStatWhereInput = {
    match: {
      finished: true,
      ...(options.leagueId ? { leagueId: options.leagueId } : {}),
      ...(options.season ? { season: options.season } : {})
    }
  };

  const stats = await prisma.matchPlayerStat.findMany({
    where,
    select: {
      playerId: true,
      teamId: true,
      minutes: true,
      position: true,
      statsPayload: true,
      player: {
        select: {
          name: true
        }
      },
      team: {
        select: {
          name: true
        }
      },
      match: {
        select: {
          leagueId: true,
          season: true,
          league: {
            select: {
              name: true
            }
          }
        }
      }
    }
  });

  return stats.map((stat) => ({
    playerId: stat.playerId,
    player: stat.player.name,
    teamId: stat.teamId,
    team: stat.team?.name ?? "Unknown team",
    leagueId: stat.match.leagueId,
    league: stat.match.league?.name ?? (stat.match.leagueId ? `League ${String(stat.match.leagueId)}` : null),
    season: stat.match.season,
    position: stat.position,
    minutes: stat.minutes,
    statsPayload: stat.statsPayload
  }));
}

function printHeader(options: CliOptions, sourceRows: number, diagnostics: PenaltyPotentialDiagnostics) {
  console.info("");
  console.info("Penalty Potential Index");
  console.info("=======================");
  console.info(
    `Scope: ${options.payloadDir ? `payload dir ${options.payloadDir}; ` : ""}` +
      `${options.leagueId ? `league ${String(options.leagueId)}` : "all leagues"}${options.season ? `, season ${options.season}` : ""}`
  );
  console.info(`Minimum minutes: ${options.minMinutes}`);
  console.info(`Source rows: ${sourceRows}; used rows: ${diagnostics.usedRows}; skipped for missing/zero minutes: ${diagnostics.skippedForMinutes}`);
  console.info(`Missing touches in box treated as 0: ${diagnostics.nullTouchesInBoxTreatedAsZero}`);
  console.info(`Missing fouls won treated as 0: ${diagnostics.nullFoulsWonTreatedAsZero}`);
  if (diagnostics.negativeValuesClamped > 0) console.info(`Negative metric values clamped to 0: ${diagnostics.negativeValuesClamped}`);
  console.info("");
  console.info("Matched FotMob fields:");
  console.info(`  touches in box: ${fieldMatchesLabel(diagnostics.fieldMatches.touchesInBox)}`);
  console.info(`  fouls won:       ${fieldMatchesLabel(diagnostics.fieldMatches.foulsWon)}`);
  console.info(`  penalties won:   ${fieldMatchesLabel(diagnostics.fieldMatches.penaltiesWon)}`);
}

function printRows(title: string, rows: PenaltyPotentialRow[], includePenalties: boolean) {
  console.info("");
  console.info(title);
  console.info("-".repeat(title.length));
  if (rows.length === 0) {
    console.info("No rows.");
    return;
  }

  const columns = [
    { key: "rank", label: "#", width: 3, value: (_row: PenaltyPotentialRow, index: number) => String(index + 1) },
    { key: "player", label: "Player", width: 24, value: (row: PenaltyPotentialRow) => row.player },
    { key: "team", label: "Team", width: 22, value: (row: PenaltyPotentialRow) => row.team },
    { key: "position", label: "Pos", width: 11, value: (row: PenaltyPotentialRow) => row.positionCategory },
    { key: "minutes", label: "Min", width: 6, value: (row: PenaltyPotentialRow) => formatInteger(row.minutes) },
    { key: "touches", label: "TIB", width: 6, value: (row: PenaltyPotentialRow) => formatDecimal(row.touchesInBox, 0) },
    { key: "fouls", label: "FWon", width: 6, value: (row: PenaltyPotentialRow) => formatDecimal(row.foulsWon, 0) },
    ...(includePenalties
      ? [{ key: "pens", label: "Pens", width: 6, value: (row: PenaltyPotentialRow) => formatNullableDecimal(row.penaltiesWon, 0) }]
      : []),
    { key: "touches90", label: "TIB90", width: 7, value: (row: PenaltyPotentialRow) => formatDecimal(row.touchesInBox90) },
    { key: "fouls90", label: "FW90", width: 7, value: (row: PenaltyPotentialRow) => formatDecimal(row.foulsWon90) },
    ...(includePenalties
      ? [{ key: "pens90", label: "Pens90", width: 7, value: (row: PenaltyPotentialRow) => formatNullableDecimal(row.penaltiesWon90) }]
      : []),
    { key: "mult", label: "Mult", width: 6, value: (row: PenaltyPotentialRow) => formatDecimal(row.positionMultiplier) },
    { key: "ppi", label: "PPI", width: 7, value: (row: PenaltyPotentialRow) => formatDecimal(row.penaltyPotentialIndex) },
    { key: "tier", label: "Tier", width: 13, value: (row: PenaltyPotentialRow) => row.tier.replace("_", " ") }
  ];

  console.info(columns.map((column) => pad(column.label, column.width)).join(" "));
  console.info(columns.map((column) => "-".repeat(column.width)).join(" "));
  for (const [index, row] of rows.entries()) {
    console.info(columns.map((column) => pad(column.value(row, index), column.width)).join(" "));
  }
}

function printResearch(research: PenaltyPotentialResearch | null, diagnostics: PenaltyPotentialDiagnostics) {
  console.info("");
  console.info("Research checks");
  console.info("---------------");
  if (!diagnostics.penaltiesWonAvailable) {
    console.info("Penalties-won data was not found in FotMob player stats payloads, so correlations were skipped.");
    return;
  }
  if (!research) {
    console.info("Not enough penalties-won sample rows for meaningful correlations.");
    return;
  }

  console.info(`Average penalties won/90 in filtered sample: ${formatNullableDecimal(research.penaltiesWonAverage90)}`);
  console.info(`PPI vs penalties won/90:         ${formatCorrelation(research.overall.ppiVsPenaltiesWon90)}`);
  console.info(`Touches in box/90 vs penalties: ${formatCorrelation(research.overall.touchesInBox90VsPenaltiesWon90)}`);
  console.info(`Fouls won/90 vs penalties:      ${formatCorrelation(research.overall.foulsWon90VsPenaltiesWon90)}`);
  console.info(`Base formula A without position: ${formatCorrelation(research.overall.baseFormulaVsPenaltiesWon90)}`);
  console.info("");
  console.info("By position:");
  for (const row of research.byPosition) {
    console.info(
      `  ${row.positionCategory.padEnd(10)} n=${String(row.sampleSize).padStart(3)} ` +
        `PPI=${formatCorrelation(row.ppiVsPenaltiesWon90)} ` +
        `TIB90=${formatCorrelation(row.touchesInBox90VsPenaltiesWon90)} ` +
        `FW90=${formatCorrelation(row.foulsWon90VsPenaltiesWon90)}`
    );
  }
  console.info("");
  console.info("Formula variants:");
  for (const row of research.formulaVariants) {
    console.info(
      `  ${row.name} (${row.touchesInBoxWeight.toFixed(2)}/${row.foulsWonWeight.toFixed(2)}): ` +
        `base=${formatCorrelation(row.baseCorrelation)}, with position=${formatCorrelation(row.positionAdjustedCorrelation)}`
    );
  }
}

function printMethodNotes() {
  console.info("");
  console.info("Notes");
  console.info("-----");
  console.info("PPI is a style/profile proxy, not a precise penalty probability.");
  console.info("Touches in box and fouls won are totalled from match payloads, then converted to per-90 after a minutes filter.");
  console.info("Null touches/fouls are treated as 0; players with null or zero total minutes are excluded.");
  console.info("Fouls won are noisy because the payload does not tell where the foul happened.");
}

function parseCliOptions(args: string[]): CliOptions {
  const value = (name: string) => argValue(args, name);
  return {
    minMinutes: parsePositiveNumber(value("min-minutes") ?? value("minMinutes"), PENALTY_POTENTIAL_DEFAULTS.minMinutes),
    limit: parsePositiveInteger(value("limit"), 30),
    underratedLimit: parsePositiveInteger(value("underrated-limit") ?? value("underratedLimit"), 30),
    leagueId: parseBigIntValue(value("league") ?? value("league-id") ?? value("leagueId")),
    season: value("season") ?? null,
    payloadDir: value("payload-dir") ?? value("payloadDir"),
    json: args.includes("--json")
  };
}

function argValue(args: string[], name: string) {
  const prefixed = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefixed));
  if (inline) return inline.slice(prefixed.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  return null;
}

function parsePositiveNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = parsePositiveNumber(value, fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBigIntValue(value: string | null) {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function fieldMatchesLabel(matches: Record<string, number>) {
  const entries = Object.entries(matches).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (entries.length === 0) return "not found";
  return entries.slice(0, 5).map(([label, count]) => `${label} (${count})`).join(", ");
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatDecimal(value: number, digits = 2) {
  return value.toFixed(digits);
}

function formatNullableDecimal(value: number | null, digits = 2) {
  return value === null ? "n/a" : formatDecimal(value, digits);
}

function formatCorrelation(value: number | null) {
  return value === null ? "n/a" : value.toFixed(3);
}

function pad(value: string, width: number) {
  const clipped = value.length > width ? `${value.slice(0, Math.max(0, width - 3))}...` : value;
  return clipped.padEnd(width);
}

function jsonOptions(options: CliOptions) {
  return {
    ...options,
    leagueId: options.leagueId === null ? null : String(options.leagueId)
  };
}

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
