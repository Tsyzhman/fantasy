import { existsSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import {
  applyProbableLineupTeamPlan,
  buildProbableLineupSyncPlan,
  fetchProbableLineupPage,
  PROBABLE_LINEUP_SOURCE_DEFINITIONS,
  type ProbableLineupApplyResult,
  type ProbableLineupSourceKey,
  type ProbableLineupTeamPlan
} from "@/machete/probable-lineup-sync";

type CliOptions = {
  apply: boolean;
  json: boolean;
  help: boolean;
  season: string | null;
  sourceKeys: Set<ProbableLineupSourceKey>;
  timeoutMs: number | undefined;
  maxAttempts: number | undefined;
};

type TeamReport = {
  sourceTeamName: string;
  databaseTeamName: string | null;
  teamId: string | null;
  planStatus: ProbableLineupTeamPlan["status"];
  resultStatus: ProbableLineupApplyResult["status"] | "NOT_APPLIED" | "FAILED";
  formation: string | null;
  sourceUpdatedText: string | null;
  startersToSet: number;
  startersToClear: number;
  matchedPlayers: number;
  unresolvedPlayers: Array<{
    sourceName: string;
    reason: string;
    alternatives: string[];
  }>;
  problems: string[];
  error: string | null;
};

type SourceReport = {
  source: ProbableLineupSourceKey;
  label: string;
  sourceUrl: string;
  leagueId: string;
  leagueName: string | null;
  season: string | null;
  status: "PLANNED" | "APPLIED" | "FAILED";
  parsedTeams: number;
  readyTeams: number;
  unchangedTeams: number;
  skippedTeams: number;
  appliedTeams: number;
  failedTeams: number;
  teams: TeamReport[];
  error: string | null;
};

run().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});

async function run() {
  loadLocalEnvironment();
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) printHelp();
  else await main(options);
}

async function main(cli: CliOptions) {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is not configured. Set it in the environment or in .env before running the sync.");
  }

  const prisma = new PrismaClient();
  const startedAt = new Date();
  const sourceReports: SourceReport[] = [];
  let sourceFailures = 0;
  let teamFailures = 0;
  let skippedTeams = 0;

  try {
    for (const definition of PROBABLE_LINEUP_SOURCE_DEFINITIONS) {
      if (!cli.sourceKeys.has(definition.key)) continue;
      try {
        const fetchedAt = new Date();
        const page = await fetchProbableLineupPage(definition, {
          timeoutMs: cli.timeoutMs,
          maxAttempts: cli.maxAttempts
        });
        const plan = await buildProbableLineupSyncPlan(prisma, {
          definition,
          page,
          season: cli.season,
          fetchedAt
        });
        const teamReports: TeamReport[] = [];
        for (const team of plan.teams) {
          if (!cli.apply || team.status !== "READY") {
            teamReports.push(teamReport(team, null, null));
            continue;
          }
          try {
            const result = await applyProbableLineupTeamPlan(prisma, team);
            teamReports.push(teamReport(team, result, null));
          } catch (error) {
            teamFailures += 1;
            teamReports.push(teamReport(team, null, errorMessage(error)));
          }
        }
        const readyTeams = plan.teams.filter((team) => team.status === "READY").length;
        const unchangedTeams = plan.teams.filter((team) => team.status === "UNCHANGED").length;
        const sourceSkippedTeams = plan.teams.filter((team) => team.status === "TEAM_UNMATCHED" || team.status === "PLAYERS_UNMATCHED").length;
        const failedTeams = teamReports.filter((team) => team.resultStatus === "FAILED").length;
        skippedTeams += sourceSkippedTeams;
        sourceReports.push({
          source: definition.key,
          label: definition.label,
          sourceUrl: definition.sourceUrl,
          leagueId: String(definition.leagueId),
          leagueName: plan.leagueName,
          season: plan.season,
          status: cli.apply ? "APPLIED" : "PLANNED",
          parsedTeams: plan.parsedTeams,
          readyTeams,
          unchangedTeams,
          skippedTeams: sourceSkippedTeams,
          appliedTeams: teamReports.filter((team) => team.resultStatus === "APPLIED").length,
          failedTeams,
          teams: teamReports,
          error: null
        });
      } catch (error) {
        sourceFailures += 1;
        sourceReports.push({
          source: definition.key,
          label: definition.label,
          sourceUrl: definition.sourceUrl,
          leagueId: String(definition.leagueId),
          leagueName: null,
          season: cli.season,
          status: "FAILED",
          parsedTeams: 0,
          readyTeams: 0,
          unchangedTeams: 0,
          skippedTeams: 0,
          appliedTeams: 0,
          failedTeams: 0,
          teams: [],
          error: errorMessage(error)
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const report = {
    mode: cli.apply ? "APPLY" : "DRY_RUN",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    sources: sourceReports,
    totals: {
      sources: sourceReports.length,
      sourceFailures,
      teamFailures,
      skippedTeams,
      appliedTeams: sourceReports.reduce((total, source) => total + source.appliedTeams, 0),
      unchangedTeams: sourceReports.reduce((total, source) => total + source.unchangedTeams, 0)
    }
  };
  if (cli.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printHumanReport(report);

  if (sourceFailures > 0 || teamFailures > 0) process.exitCode = 1;
  else if (skippedTeams > 0) process.exitCode = 2;
}

function teamReport(
  plan: ProbableLineupTeamPlan,
  result: ProbableLineupApplyResult | null,
  error: string | null
): TeamReport {
  const unresolvedPlayers = plan.playerResolutions
    .filter((player) => player.reason !== "MATCHED")
    .map((player) => ({
      sourceName: player.sourcePlayer.fullName ?? player.sourcePlayer.name,
      reason: player.reason,
      alternatives: player.alternatives.map((alternative) => `${alternative.playerName} (${alternative.confidence.toFixed(2)})`)
    }));
  return {
    sourceTeamName: plan.sourceLineup.teamName,
    databaseTeamName: plan.databaseTeamName,
    teamId: plan.teamId === null ? null : String(plan.teamId),
    planStatus: plan.status,
    resultStatus: error ? "FAILED" : result?.status ?? "NOT_APPLIED",
    formation: plan.sourceLineup.formation,
    sourceUpdatedText: plan.sourceLineup.sourceUpdatedText,
    startersToSet: plan.startersToSet,
    startersToClear: plan.startersToClear,
    matchedPlayers: plan.playerResolutions.filter((player) => player.reason === "MATCHED").length,
    unresolvedPlayers,
    problems: plan.problems,
    error
  };
}

function parseCliOptions(argumentsList: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    json: false,
    help: false,
    season: null,
    sourceKeys: new Set(PROBABLE_LINEUP_SOURCE_DEFINITIONS.map((source) => source.key)),
    timeoutMs: undefined,
    maxAttempts: undefined
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index] ?? "";
    if (argument === "--apply") options.apply = true;
    else if (argument === "--dry-run") options.apply = false;
    else if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--season") options.season = requiredValue(argumentsList, ++index, "--season");
    else if (argument.startsWith("--season=")) options.season = requiredInlineValue(argument, "--season");
    else if (argument === "--source") options.sourceKeys = sourceKeys(requiredValue(argumentsList, ++index, "--source"));
    else if (argument.startsWith("--source=")) options.sourceKeys = sourceKeys(requiredInlineValue(argument, "--source"));
    else if (argument === "--timeout-ms") options.timeoutMs = positiveCliInteger(requiredValue(argumentsList, ++index, "--timeout-ms"), "--timeout-ms");
    else if (argument.startsWith("--timeout-ms=")) options.timeoutMs = positiveCliInteger(requiredInlineValue(argument, "--timeout-ms"), "--timeout-ms");
    else if (argument === "--max-attempts") options.maxAttempts = boundedCliInteger(requiredValue(argumentsList, ++index, "--max-attempts"), "--max-attempts", 1, 5);
    else if (argument.startsWith("--max-attempts=")) options.maxAttempts = boundedCliInteger(requiredInlineValue(argument, "--max-attempts"), "--max-attempts", 1, 5);
    else throw new Error(`Unknown argument '${argument}'. Run with --help for usage.`);
  }
  return options;
}

function sourceKeys(rawValue: string) {
  const values = rawValue.split(",").map((value) => value.trim().toLocaleLowerCase("en")).filter(Boolean);
  if (values.includes("all")) return new Set<ProbableLineupSourceKey>(PROBABLE_LINEUP_SOURCE_DEFINITIONS.map((source) => source.key));
  const result = new Set<ProbableLineupSourceKey>();
  for (const value of values) {
    if (["epl", "ffs", "ffscout", "fantasy-football-scout"].includes(value)) result.add("epl");
    else if (["serie-a", "seriea", "italy", "gazzetta"].includes(value)) result.add("serie-a");
    else if (["bundesliga", "bund", "germany", "ligainsider"].includes(value)) result.add("bundesliga");
    else if (["ligue-1", "ligue1", "france", "fantasy-coach"].includes(value)) result.add("ligue-1");
    else throw new Error(`Unknown source '${value}'. Use all, epl, serie-a, bundesliga or ligue-1.`);
  }
  if (result.size === 0) throw new Error("--source must select at least one source.");
  return result;
}

function printHumanReport(report: {
  mode: string;
  sources: SourceReport[];
  totals: { sourceFailures: number; teamFailures: number; skippedTeams: number; appliedTeams: number; unchangedTeams: number };
}) {
  console.log(report.mode === "APPLY" ? "Probable-lineup sync (apply)" : "Probable-lineup sync (dry run; database unchanged)");
  for (const source of report.sources) {
    if (source.status === "FAILED") {
      console.log(`\n[${source.source}] FAILED: ${source.error}`);
      continue;
    }
    console.log(`\n[${source.source}] ${source.leagueName} ${source.season}: parsed=${source.parsedTeams}, ready=${source.readyTeams}, unchanged=${source.unchangedTeams}, skipped=${source.skippedTeams}, applied=${source.appliedTeams}`);
    for (const team of source.teams) {
      const destination = team.databaseTeamName ? ` -> ${team.databaseTeamName}` : "";
      const status = team.resultStatus === "NOT_APPLIED" ? team.planStatus : team.resultStatus;
      const changes = team.planStatus === "READY" ? ` (+${team.startersToSet}/-${team.startersToClear})` : "";
      console.log(`  ${status.padEnd(17)} ${team.sourceTeamName}${destination}${changes}`);
      if (team.error) console.log(`    error: ${team.error}`);
      for (const problem of team.problems) console.log(`    problem: ${problem}`);
      for (const player of team.unresolvedPlayers) {
        const alternatives = player.alternatives.length > 0 ? `; candidates: ${player.alternatives.join(", ")}` : "";
        console.log(`    unresolved: ${player.sourceName} [${player.reason}]${alternatives}`);
      }
    }
  }
  console.log(`\nTotals: applied=${report.totals.appliedTeams}, unchanged=${report.totals.unchangedTeams}, skipped=${report.totals.skippedTeams}, source failures=${report.totals.sourceFailures}, team failures=${report.totals.teamFailures}`);
}

function printHelp() {
  console.log(`Sync probable starting XIs from Fantasy Football Scout (EPL), Gazzetta (Serie A), LigaInsider (Bundesliga), and Fantasy Coach (Ligue 1).

Usage:
  npm run starters:sync-probable
  npm run starters:sync-probable -- --apply
  npm run starters:sync-probable -- --source bundesliga --season 2026/2027 --apply
  npm run starters:sync-probable -- --source ligue-1 --season 2026/2027 --apply

Options:
  --apply                 Apply safe, fully resolved team lineups (default is dry-run)
  --dry-run               Preview only
  --source all|epl|serie-a|bundesliga|ligue-1[,..]
  --season YYYY/YYYY      Override the current league season
  --timeout-ms N          Per-request timeout (default 20000)
  --max-attempts N        Fetch attempts from 1 to 5 (default 3)
  --json                  Machine-readable report
  --help                  Show this help

Safety: EPL/Serie A must contain 20 teams, Bundesliga/Ligue 1 18 teams, and every team must contain 11 unique players.
A database team is changed only after all 11 players resolve uniquely to its active roster.`);
}

function loadLocalEnvironment() {
  if (process.env.DATABASE_URL?.trim() || typeof process.loadEnvFile !== "function") return;
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) process.loadEnvFile(path);
    if (process.env.DATABASE_URL?.trim()) return;
  }
}

function requiredValue(argumentsList: string[], index: number, name: string) {
  const value = argumentsList[index]?.trim();
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function requiredInlineValue(argument: string, name: string) {
  const value = argument.slice(name.length + 1).trim();
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
}

function positiveCliInteger(value: string, name: string) {
  return boundedCliInteger(value, name, 1, Number.MAX_SAFE_INTEGER);
}

function boundedCliInteger(value: string, name: string, minimum: number, maximum: number) {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
