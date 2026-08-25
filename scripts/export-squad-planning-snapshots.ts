import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

type CliOptions = {
  leagueId?: bigint;
  season?: string;
  provider?: string;
  roundKey?: string;
  status?: string;
  outDir: string;
  stdout: boolean;
};

void main();

async function main() {
  loadDotEnv();

  try {
    const options = parseArgs(process.argv.slice(2));
    const prisma = new PrismaClient();
    try {
      const snapshots = await prisma.squadPlanningSnapshot.findMany({
        where: {
          ...(options.leagueId ? { leagueId: options.leagueId } : {}),
          ...(options.season ? { season: options.season } : {}),
          ...(options.provider ? { provider: options.provider } : {}),
          ...(options.roundKey ? { roundKey: options.roundKey } : {}),
          ...(options.status ? { status: options.status } : {})
        },
        orderBy: [{ leagueId: "asc" }, { season: "asc" }, { firstKickoffAt: "asc" }, { provider: "asc" }]
      });

      if (snapshots.length === 0) {
        console.info("[squad-snapshots] No snapshots matched the requested filters.");
        return;
      }

      if (options.stdout) {
        console.info(JSON.stringify({ snapshots }, null, 2));
        return;
      }

      mkdirSync(options.outDir, { recursive: true });
      for (const snapshot of snapshots) {
        const fileBase = [
          "squad",
          snapshot.leagueId.toString(),
          snapshot.season.replace(/\//g, "-"),
          snapshot.provider,
          snapshot.roundKey.replace(/[^\w.-]+/g, "-")
        ].join("_");
        const filePath = join(options.outDir, `${fileBase}.json`);
        writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
        console.info(
          `[squad-snapshots] ${filePath} status=${snapshot.status} players=${snapshot.playersCount} ` +
          `captured=${snapshot.capturedAt?.toISOString() ?? "never"} kickoff=${snapshot.firstKickoffAt.toISOString()}`
        );
      }
      console.info(`[squad-snapshots] Exported ${snapshots.length} snapshot(s) to ${resolve(options.outDir)}`);
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error(`[squad-snapshots] Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { outDir: join("output", "squad-planning-snapshots"), stdout: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--league=")) {
      options.leagueId = parseBigInt(arg.slice("--league=".length), "--league");
    } else if (arg === "--league") {
      options.leagueId = parseBigInt(requireNextValue(args, ++index, "--league"), "--league");
    } else if (arg.startsWith("--season=")) {
      options.season = requireNextValue(arg.split("="), 1, "--season");
    } else if (arg === "--season") {
      options.season = requireNextValue(args, ++index, "--season");
    } else if (arg.startsWith("--provider=")) {
      options.provider = requireNextValue(arg.split("="), 1, "--provider").toUpperCase();
    } else if (arg === "--provider") {
      options.provider = requireNextValue(args, ++index, "--provider").toUpperCase();
    } else if (arg.startsWith("--round-key=")) {
      options.roundKey = requireNextValue(arg.split("="), 1, "--round-key");
    } else if (arg === "--round-key") {
      options.roundKey = requireNextValue(args, ++index, "--round-key");
    } else if (arg.startsWith("--status=")) {
      options.status = requireNextValue(arg.split("="), 1, "--status").toUpperCase();
    } else if (arg === "--status") {
      options.status = requireNextValue(args, ++index, "--status").toUpperCase();
    } else if (arg.startsWith("--out=")) {
      options.outDir = requireNextValue(arg.split("="), 1, "--out");
    } else if (arg === "--out") {
      options.outDir = requireNextValue(args, ++index, "--out");
    } else if (arg === "--stdout") {
      options.stdout = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseBigInt(value: string, flag: string) {
  try {
    return BigInt(value.trim());
  } catch {
    throw new Error(`${flag} expects a numeric FotMob league id.`);
  }
}

function requireNextValue(values: string[], index: number, flag: string) {
  const value = values[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
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

function printHelp() {
  console.info(`
Export stored squad planning snapshots (captured ~1 minute before each tour's first kickoff).

Usage:
  npm run snapshots:squad -- [options]

Options:
  --league=<fotmob-id>   Only this league (e.g. 63).
  --season=<season>      Only this season (e.g. 2026/2027).
  --provider=<provider>  Only this fantasy provider (SPORTS_RU or FPL).
  --round-key=<key>      Only this round key (e.g. round:5).
  --status=<status>      Only this status (PENDING, READY, FAILED).
  --out=<directory>      Output directory. Default: output/squad-planning-snapshots
  --stdout               Print JSON to stdout instead of writing files.

Each READY snapshot contains the full squad planning table as it was at capture time:
  meta: provider, leagueId, season, roundKey/roundLabel, dueAt, capturedAt, payloadHash
  players: the same player-pool rows served by GET /api/machete/squads.
`);
}
