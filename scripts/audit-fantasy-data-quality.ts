import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  runFantasyDataQualityAudit,
  type FantasyDataQualityAuditReport
} from "../src/machete/data_quality_audit";

type CliOptions = {
  leagueId: bigint | null;
  season: string | null;
  coveragePercent: number;
  maximumLatencyHours: number;
  persist: boolean;
  json: boolean;
  allowGateFailure: boolean;
  help: boolean;
};

loadDotEnv();

void main().catch((error) => {
  console.error("[data-quality] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.leagueId || !options.season) {
    printUsage();
    throw new Error("Both --league and --season are required.");
  }
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not configured.");

  const prisma = new PrismaClient();
  try {
    const report = await runFantasyDataQualityAudit(prisma, {
      leagueId: options.leagueId,
      season: options.season,
      coveragePercent: options.coveragePercent,
      maximumLatencyHours: options.maximumLatencyHours,
      persist: options.persist
    });

    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
    if (!report.quality.betaGate.passed && !options.allowGateFailure) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

function parseOptions(args: string[]): CliOptions {
  const value = (name: string) => argValue(args, name);
  return {
    leagueId: parseBigInt(value("league") ?? value("league-id")),
    season: value("season"),
    coveragePercent: parsePercent(value("coverage-percent"), 98),
    maximumLatencyHours: parsePositiveNumber(value("maximum-latency-hours"), 6),
    persist: !args.includes("--no-persist"),
    json: args.includes("--json"),
    allowGateFailure: args.includes("--allow-gate-failure"),
    help: args.includes("--help") || args.includes("-h")
  };
}

function argValue(args: string[], name: string) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function parseBigInt(value: string | null) {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid integer: ${value}`);
  }
}

function parsePercent(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error(`Invalid percentage: ${value}`);
  return parsed;
}

function parsePositiveNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid positive number: ${value}`);
  return parsed;
}

function printUsage() {
  console.log(`Usage:
  npm run data:quality -- --league=47 --season=2025/2026

Options:
  --coverage-percent=98          Required forecast, player, match, and basic-row coverage.
  --maximum-latency-hours=6     Maximum raw-payload to normalized-stat promotion latency.
  --no-persist                  Calculate without saving an audit run.
  --allow-gate-failure          Return exit code 0 while retaining FAIL in the report.
  --json                        Print machine-readable output.`);
}

function printReport(report: FantasyDataQualityAuditReport) {
  const quality = report.quality;
  console.log(`[data-quality] ${report.scope.leagueId} ${report.scope.season}`);
  console.log(`[data-quality] Model: ${report.model.name} (${report.model.version}, sha256:${report.model.hash.slice(0, 12)})`);
  console.table([
    { metric: "Forecast coverage", covered: quality.forecasts.available, total: quality.forecasts.activePlayers, percent: quality.forecasts.coveragePercent },
    { metric: "Active-player data", covered: quality.players.withBasicStats, total: quality.players.activePlayers, percent: quality.players.coveragePercent },
    { metric: "Finished-match data", covered: quality.matches.withPlayerStats, total: quality.matches.finishedMatches, percent: quality.matches.coveragePercent },
    { metric: "Basic stat rows", covered: quality.statRows.complete, total: quality.statRows.total, percent: quality.statRows.coveragePercent },
    { metric: "Promotion within limit", covered: quality.matches.promotedWithinLimit, total: quality.matches.finishedMatches, percent: quality.matches.promotionLatencyCoveragePercent }
  ]);
  console.log(`[data-quality] Saved run: ${report.runId ?? "no (no-persist)"}`);
  console.log(`[data-quality] Beta gate: ${quality.betaGate.passed ? "PASS" : "FAIL"}`);
  const missingForecastReasons = new Map<string, number>();
  for (const player of quality.forecasts.missing) {
    for (const reason of player.reasons) missingForecastReasons.set(reason, (missingForecastReasons.get(reason) ?? 0) + 1);
  }
  if (missingForecastReasons.size > 0) {
    console.table([...missingForecastReasons].map(([reason, players]) => ({ reason, players })).sort((left, right) => right.players - left.players));
  }
  for (const reason of quality.betaGate.reasons) console.log(`[data-quality] Gate failure: ${reason}`);
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
