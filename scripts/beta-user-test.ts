import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  buildBetaUserTestReport,
  validateBetaReviewInput,
  type BetaReviewInput
} from "../src/beta/user-test";

type CliArguments = {
  command: "report" | "review";
  options: Map<string, string>;
};

loadDotEnv();

void main().catch((error) => {
  console.error(`[beta-user-test] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.options.has("help")) {
    printUsage();
    return;
  }
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not configured.");

  const prisma = new PrismaClient();
  try {
    if (args.command === "review") {
      await reviewRun(prisma, args.options);
      return;
    }
    await printReport(prisma, args.options);
  } finally {
    await prisma.$disconnect();
  }
}

async function printReport(prisma: PrismaClient, options: Map<string, string>) {
  rejectUnknownOptions(options, new Set(["help", "since-days", "require-pass"]));
  const sinceDays = integerOption(options, "since-days", 30, 1, 365);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1_000);
  const runs = await prisma.betaTestRun.findMany({
    where: { startedAt: { gte: since } },
    select: {
      id: true,
      userId: true,
      deviceClass: true,
      synthetic: true,
      valid: true,
      withoutHelp: true,
      transferReasonUnderstood: true,
      usabilityRating: true,
      criticalIssue: true,
      startedAt: true,
      observations: {
        select: {
          kind: true,
          name: true,
          route: true,
          value: true,
          count: true,
          createdAt: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }
    },
    orderBy: [{ startedAt: "asc" }, { id: "asc" }]
  });
  const report = {
    scope: { since: since.toISOString(), sinceDays },
    ...buildBetaUserTestReport(runs)
  };
  console.log(JSON.stringify(report, null, 2));
  if (booleanOption(options, "require-pass", false) && !report.gate.passed) process.exitCode = 2;
}

async function reviewRun(prisma: PrismaClient, options: Map<string, string>) {
  rejectUnknownOptions(
    options,
    new Set([
      "help",
      "run-id",
      "valid",
      "without-help",
      "transfer-understood",
      "rating",
      "critical",
      "invalid-reason",
      "notes"
    ])
  );
  const valid = requiredBooleanOption(options, "valid");
  const input: BetaReviewInput = {
    runId: requiredOption(options, "run-id"),
    valid,
    withoutHelp: valid ? requiredBooleanOption(options, "without-help") : null,
    transferReasonUnderstood: valid ? requiredBooleanOption(options, "transfer-understood") : null,
    usabilityRating: valid ? integerOption(options, "rating", null, 1, 5) : null,
    criticalIssue: valid ? requiredBooleanOption(options, "critical") : null,
    invalidReason: valid ? null : optionalText(options, "invalid-reason"),
    moderatorNotes: optionalText(options, "notes")
  };
  const parsed = validateBetaReviewInput(input);
  if (!parsed.ok) throw new Error(parsed.error);
  const existing = await prisma.betaTestRun.findUnique({ where: { id: input.runId }, select: { id: true, synthetic: true } });
  if (!existing) throw new Error("Beta test run was not found.");
  if (existing.synthetic) throw new Error("Synthetic runs cannot be moderator-approved for the user gate.");

  const reviewedAt = new Date();
  await prisma.betaTestRun.update({
    where: { id: input.runId },
    data: {
      valid: parsed.value.valid,
      withoutHelp: parsed.value.withoutHelp,
      transferReasonUnderstood: parsed.value.transferReasonUnderstood,
      usabilityRating: parsed.value.usabilityRating,
      criticalIssue: parsed.value.criticalIssue,
      invalidReason: parsed.value.invalidReason,
      moderatorNotes: parsed.value.moderatorNotes,
      reviewedAt
    }
  });
  console.log(JSON.stringify({
    reviewed: true,
    runId: input.runId,
    participantCode: input.runId.slice(0, 8),
    valid: input.valid,
    reviewedAt: reviewedAt.toISOString()
  }, null, 2));
}

function parseArguments(argv: string[]): CliArguments {
  const commandValue = argv[0]?.startsWith("--") ? "report" : argv[0] ?? "report";
  if (commandValue !== "report" && commandValue !== "review") {
    printUsage();
    throw new Error(`Unknown command: ${commandValue}`);
  }
  const options = new Map<string, string>();
  for (const argument of argv.slice(commandValue === argv[0] ? 1 : 0)) {
    if (!argument.startsWith("--")) throw new Error(`Unexpected positional argument: ${argument}`);
    const separator = argument.indexOf("=");
    const key = argument.slice(2, separator < 0 ? undefined : separator);
    const value = separator < 0 ? "true" : argument.slice(separator + 1);
    if (!key || options.has(key)) throw new Error(`Invalid or duplicate option: --${key}`);
    options.set(key, value);
  }
  return { command: commandValue, options };
}

function rejectUnknownOptions(options: Map<string, string>, allowed: Set<string>) {
  for (const key of options.keys()) {
    if (!allowed.has(key)) throw new Error(`Unknown option: --${key}`);
  }
}

function requiredOption(options: Map<string, string>, key: string) {
  const value = options.get(key)?.trim();
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function optionalText(options: Map<string, string>, key: string) {
  const value = options.get(key)?.trim();
  return value || null;
}

function requiredBooleanOption(options: Map<string, string>, key: string) {
  if (!options.has(key)) throw new Error(`--${key}=true|false is required.`);
  return booleanOption(options, key, false);
}

function booleanOption(options: Map<string, string>, key: string, fallback: boolean) {
  const value = options.get(key);
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`--${key} must be true or false.`);
}

function integerOption(options: Map<string, string>, key: string, fallback: number, minimum: number, maximum: number): number;
function integerOption(options: Map<string, string>, key: string, fallback: null, minimum: number, maximum: number): number | null;
function integerOption(options: Map<string, string>, key: string, fallback: number | null, minimum: number, maximum: number) {
  const raw = options.get(key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`--${key} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage:
  npm run beta:user-test -- report --since-days=30
  npm run beta:user-test -- report --since-days=30 --require-pass=true
  npm run beta:user-test -- review --run-id=<uuid> --valid=true --without-help=true --transfer-understood=true --rating=4 --critical=false --notes="optional"
  npm run beta:user-test -- review --run-id=<uuid> --valid=false --invalid-reason="reason" --notes="optional"

The report never prints account email, name, or internal user ID. The gate uses only the first moderator-approved run per distinct participant.`);
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
