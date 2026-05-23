import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  LEAGUE_SEASON_RETENTION_TIME_ZONE,
  LEAGUE_SEASON_RETENTION_YEARS,
  pruneOldLeagueSeasons,
  type RetentionCalendarType
} from "../src/core_data/league-season-retention";

type CliOptions = {
  dryRun: boolean;
  yes: boolean;
  json: boolean;
  now?: Date;
  retentionYears?: number;
  timeZone?: string;
  calendarTypes?: RetentionCalendarType[];
};

void main();

async function main() {
  loadDotEnv();

  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.dryRun && !options.yes) {
      throw new Error("Refusing to delete old league seasons without --yes. Use --dry-run to preview.");
    }

    const prisma = new PrismaClient();
    try {
      const result = await pruneOldLeagueSeasons(prisma, {
        dryRun: options.dryRun,
        now: options.now,
        retentionYears: options.retentionYears,
        timeZone: options.timeZone,
        calendarTypes: options.calendarTypes
      });

      if (options.json) {
        console.info(JSON.stringify(result, null, 2));
      } else {
        printResult(result);
      }
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error(`[retention] Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    yes: false,
    json: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg.startsWith("--date=")) {
      options.now = parseDate(arg.slice("--date=".length));
    } else if (arg === "--date") {
      options.now = parseDate(requireNextValue(args, ++index, "--date"));
    } else if (arg.startsWith("--retention-years=")) {
      options.retentionYears = parsePositiveInt(arg.slice("--retention-years=".length), "--retention-years");
    } else if (arg === "--retention-years") {
      options.retentionYears = parsePositiveInt(requireNextValue(args, ++index, "--retention-years"), "--retention-years");
    } else if (arg.startsWith("--timezone=")) {
      options.timeZone = arg.slice("--timezone=".length);
    } else if (arg === "--timezone") {
      options.timeZone = requireNextValue(args, ++index, "--timezone");
    } else if (arg.startsWith("--calendar-type=")) {
      options.calendarTypes = parseCalendarTypes(arg.slice("--calendar-type=".length));
    } else if (arg === "--calendar-type") {
      options.calendarTypes = parseCalendarTypes(requireNextValue(args, ++index, "--calendar-type"));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid --date value: ${value}`);
  return date;
}

function parsePositiveInt(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function parseCalendarTypes(value: string): RetentionCalendarType[] {
  if (value === "all") return ["spring_autumn", "autumn_spring"];
  if (value === "spring_autumn" || value === "autumn_spring") return [value];
  throw new Error("--calendar-type must be spring_autumn, autumn_spring, or all.");
}

function requireNextValue(args: string[], index: number, flag: string) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function printResult(result: Awaited<ReturnType<typeof pruneOldLeagueSeasons>>) {
  console.info(`[retention] Mode: ${result.dryRun ? "dry-run" : "delete"}`);
  console.info(
    `[retention] Date: ${result.referenceDate} ${result.timeZone}; keep=${result.retentionYears} seasons; cutoff start year=${result.cutoffStartYear}.`
  );
  console.info(`[retention] Active calendar types: ${result.activeCalendarTypes.join(", ") || "none"}.`);

  if (result.skipped) {
    console.info(`[retention] Skipped: ${result.reason ?? "nothing to do"}.`);
    return;
  }

  console.info(`[retention] Candidate league seasons: ${result.candidates.length}.`);
  for (const candidate of result.candidates.slice(0, 20)) {
    const title = candidate.name ? `${candidate.name} ` : "";
    console.info(`  - ${title}${candidate.leagueId} ${candidate.season} (${candidate.calendarType})`);
  }
  if (result.candidates.length > 20) {
    console.info(`  ...and ${result.candidates.length - 20} more.`);
  }

  console.info("[retention] Matching rows before cleanup:");
  for (const [key, count] of Object.entries(result.counts)) {
    console.info(`  ${key.padEnd(28)} ${count}`);
  }

  if (result.dryRun) return;

  console.info("[retention] Deleted rows:");
  for (const [key, count] of Object.entries(result.deleted)) {
    console.info(`  ${key.padEnd(28)} ${count}`);
  }
}

function printHelp() {
  console.info(`
Usage:
  npm run retention:prune-league-seasons -- --dry-run --date=2026-01-01
  npm run retention:prune-league-seasons -- --dry-run --date=2026-07-01
  npm run retention:prune-league-seasons -- --yes

Options:
  --dry-run                         Preview candidates and row counts.
  --yes                             Required for destructive cleanup.
  --date YYYY-MM-DD                 Evaluate retention as if run on this date.
  --calendar-type spring_autumn     Override the date gate; also accepts autumn_spring or all.
  --retention-years ${LEAGUE_SEASON_RETENTION_YEARS}                Number of latest seasons to keep.
  --timezone ${LEAGUE_SEASON_RETENTION_TIME_ZONE}          Date gate timezone.
  --json                            Print machine-readable JSON.
`);
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
