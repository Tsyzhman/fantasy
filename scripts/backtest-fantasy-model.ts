import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { getActiveScoringModelBundleForSource } from "../src/lib/scoring";
import {
  FANTASY_BACKTEST_POSITION_GROUPS,
  buildFantasyBacktestObservations,
  runFantasyBacktest,
  summarizeFantasyBacktestSamples,
  stableFantasyModelConfiguration
} from "../src/machete/fantasy_backtest";
import {
  FANTASY_PROJECTION_CALIBRATION,
  buildFantasyBacktestHorizonSamples,
  calibrateFantasyBacktestSamples,
  fantasyBacktestHoldoutStart,
  fantasyProjectionCalibrationConfiguration
} from "../src/machete/fantasy_projection_calibration";

type CliOptions = {
  leagueId: bigint | null;
  season: string | null;
  expectedMatches: number | null;
  historyMatches: number;
  minimumHistory: number;
  minimumImprovementPercent: number;
  requiredPassingPositions: number;
  minimumPositionSamples: number;
  persist: boolean;
  json: boolean;
  allowGateFailure: boolean;
  help: boolean;
};

loadDotEnv();

void main().catch((error) => {
  console.error("[fantasy-backtest] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
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
  let runId: string | null = null;
  try {
    const modelBundle = await getActiveScoringModelBundleForSource("MACHETE", prisma);
    const scoringModelConfiguration = stableFantasyModelConfiguration(modelBundle.model);
    const calibrationConfiguration = fantasyProjectionCalibrationConfiguration();
    const modelConfiguration = {
      scoring: scoringModelConfiguration,
      projectionCalibration: calibrationConfiguration
    };
    const modelHash = createHash("sha256").update(JSON.stringify(modelConfiguration)).digest("hex");
    const modelVersion = `${modelVersionLabel(modelBundle.identity)}+${FANTASY_PROJECTION_CALIBRATION.featureVersion}`;
    const scopedMatches = await prisma.coreMatch.findMany({
      where: {
        leagueId: options.leagueId,
        season: options.season,
        cancelled: false
      },
      include: {
        playerStats: true,
        teamStats: true
      },
      orderBy: [{ matchDate: "asc" }, { id: "asc" }]
    });
    const competitionMatches = scopedMatches.filter((match) => match.status !== "SEASON_AGGREGATE");
    const finishedMatches = competitionMatches.filter((match) => match.finished);
    const datedFinishedMatches = finishedMatches.filter((match) => match.matchDate !== null);
    const teamIds = new Set(
      competitionMatches.flatMap((match) => [match.homeTeamId, match.awayTeamId].filter((value): value is bigint => value !== null).map(String))
    );
    const inferredExpectedMatches = teamIds.size >= 2 ? teamIds.size * (teamIds.size - 1) : null;
    const expectedMatches = options.expectedMatches ?? inferredExpectedMatches;
    const expectedMatchesSource = options.expectedMatches ? "EXPLICIT" : inferredExpectedMatches ? "INFERRED_DOUBLE_ROUND_ROBIN" : "UNAVAILABLE";
    const unfinishedMatches = competitionMatches.length - finishedMatches.length;
    const seasonComplete = expectedMatches !== null && finishedMatches.length === expectedMatches && unfinishedMatches === 0;
    const observations = buildFantasyBacktestObservations(datedFinishedMatches);

    if (finishedMatches.length === 0) throw new Error("No finished matches were found for the selected league and season.");
    if (observations.length === 0) throw new Error("Finished matches contain no played player-stat rows.");

    const rawResult = runFantasyBacktest(observations, modelBundle.model, {
      historyMatches: options.historyMatches,
      minimumHistory: options.minimumHistory,
      minimumImprovementPercent: options.minimumImprovementPercent,
      requiredPassingPositions: options.requiredPassingPositions
    });
    const calibratedSamples = calibrateFantasyBacktestSamples(rawResult.samples);
    const holdoutStartsAt = fantasyBacktestHoldoutStart(calibratedSamples);
    const holdoutRawSummary = summarizeFantasyBacktestSamples(
      rawResult.samples.filter((sample) => sample.matchDate >= holdoutStartsAt),
      undefined,
      options
    );
    const nextObservationSummary = summarizeFantasyBacktestSamples(
      calibratedSamples.filter((sample) => sample.matchDate >= holdoutStartsAt),
      undefined,
      options
    );
    const threeObservationSummary = summarizeFantasyBacktestSamples(
      buildFantasyBacktestHorizonSamples(calibratedSamples, 3).filter((sample) => sample.matchDate >= holdoutStartsAt),
      undefined,
      options
    );
    const primarySummary = summarizeFantasyBacktestSamples(
      buildFantasyBacktestHorizonSamples(calibratedSamples, FANTASY_PROJECTION_CALIBRATION.betaHorizon).filter(
        (sample) => sample.matchDate >= holdoutStartsAt
      ),
      undefined,
      options
    );

    const configuration = {
      leagueId: String(options.leagueId),
      season: options.season,
      expectedMatches,
      expectedMatchesSource,
      historyMatches: options.historyMatches,
      minimumHistory: options.minimumHistory,
      minimumImprovementPercent: options.minimumImprovementPercent,
      requiredPassingPositions: options.requiredPassingPositions,
      minimumPositionSamples: options.minimumPositionSamples,
      validation: {
        holdoutStartsAt,
        holdoutFraction: FANTASY_PROJECTION_CALIBRATION.finalHoldoutFraction,
        primaryBetaHorizon: FANTASY_PROJECTION_CALIBRATION.betaHorizon,
        reportedHorizons: [1, 3, FANTASY_PROJECTION_CALIBRATION.betaHorizon]
      },
      model: {
        hash: modelHash,
        version: modelVersion,
        identity: {
          ...modelBundle.identity,
          configuredModelUpdatedAt: modelBundle.identity.configuredModelUpdatedAt?.toISOString() ?? null
        },
        configuration: modelConfiguration
      }
    };

    if (options.persist) {
      const run = await prisma.fantasyBacktestRun.create({
        data: {
          leagueId: options.leagueId,
          season: options.season,
          modelSource: "MACHETE",
          modelName: modelBundle.identity.configuredModelName,
          modelVersion,
          modelHash,
          baseline: "LAST_5_MEAN_FP_PROJECTED_OVER_5_OBSERVATIONS",
          historyMatches: options.historyMatches,
          minimumHistory: options.minimumHistory,
          expectedMatches,
          finishedMatches: finishedMatches.length,
          seasonComplete,
          configuration: configuration as unknown as Prisma.InputJsonValue
        }
      });
      runId = run.id;
    }

    const positionsWithMinimumSamples = FANTASY_BACKTEST_POSITION_GROUPS.filter(
      (position) => primarySummary.byPosition[position].count >= options.minimumPositionSamples
    );
    const passingPositions = FANTASY_BACKTEST_POSITION_GROUPS.filter(
      (position) =>
        primarySummary.byPosition[position].count >= options.minimumPositionSamples &&
        primarySummary.byPosition[position].passesImprovementThreshold
    );
    const nextObservationPassingPositions = FANTASY_BACKTEST_POSITION_GROUPS.filter(
      (position) => nextObservationSummary.byPosition[position].passesImprovementThreshold
    );
    const overallBeatsBaseline = beatsBaseline(primarySummary.overall);
    const allPositionsCovered = positionsWithMinimumSamples.length === FANTASY_BACKTEST_POSITION_GROUPS.length;
    const reasons: string[] = [];
    if (!seasonComplete) reasons.push(`finished matches ${finishedMatches.length} do not equal expected matches ${expectedMatches ?? "unknown"}`);
    if (datedFinishedMatches.length !== finishedMatches.length) reasons.push(`${finishedMatches.length - datedFinishedMatches.length} finished match(es) have no date`);
    if (!allPositionsCovered) reasons.push(`positions with at least ${options.minimumPositionSamples} samples: ${positionsWithMinimumSamples.join(", ") || "none"}`);
    if (!overallBeatsBaseline) reasons.push(`model does not beat the baseline on overall MAE or RMSE over ${FANTASY_PROJECTION_CALIBRATION.betaHorizon} observations`);
    if (passingPositions.length < options.requiredPassingPositions) {
      reasons.push(
        `only ${passingPositions.length}/${FANTASY_BACKTEST_POSITION_GROUPS.length} positions reach the ${options.minimumImprovementPercent}% improvement threshold over ${FANTASY_PROJECTION_CALIBRATION.betaHorizon} observations`
      );
    }
    const gatePassed = seasonComplete && datedFinishedMatches.length === finishedMatches.length && allPositionsCovered && overallBeatsBaseline && passingPositions.length >= options.requiredPassingPositions;
    const report = {
      generatedAt: new Date().toISOString(),
      runId,
      model: {
        name: modelBundle.identity.configuredModelName,
        version: modelVersion,
        hash: modelHash,
        configuredSource: modelBundle.identity.configuredModelSource,
        fallback: modelBundle.identity.fallback,
        projectionCalibration: calibrationConfiguration
      },
      dataset: {
        leagueId: String(options.leagueId),
        season: options.season,
        teams: teamIds.size,
        matchesInScope: competitionMatches.length,
        finishedMatches: finishedMatches.length,
        datedFinishedMatches: datedFinishedMatches.length,
        unfinishedMatches,
        expectedMatches,
        expectedMatchesSource,
        seasonComplete,
        playerStatRows: observations.length,
        firstMatchAt: datedFinishedMatches[0]?.matchDate?.toISOString() ?? null,
        lastMatchAt: datedFinishedMatches.at(-1)?.matchDate?.toISOString() ?? null
      },
      summary: primarySummary,
      validation: {
        method: "ROLLING_ORIGIN_FINAL_HOLDOUT",
        holdoutStartsAt,
        holdoutFraction: FANTASY_PROJECTION_CALIBRATION.finalHoldoutFraction,
        rawNextObservation: holdoutRawSummary,
        calibratedNextObservation: nextObservationSummary,
        calibratedThreeObservation: threeObservationSummary,
        calibratedFiveObservation: primarySummary
      },
      betaGate: {
        primaryHorizon: FANTASY_PROJECTION_CALIBRATION.betaHorizon,
        minimumPositionSamples: options.minimumPositionSamples,
        positionsWithMinimumSamples,
        passingPositions,
        nextObservationPassingPositions,
        overallBeatsBaseline,
        passed: gatePassed,
        reasons
      }
    };

    if (runId) {
      await prisma.fantasyBacktestRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          sampleSize: primarySummary.samples,
          modelMae: primarySummary.overall.modelMae,
          baselineMae: primarySummary.overall.baselineMae,
          modelRmse: primarySummary.overall.modelRmse,
          baselineRmse: primarySummary.overall.baselineRmse,
          passingPositions: passingPositions.length,
          gatePassed,
          report: report as unknown as Prisma.InputJsonValue,
          completedAt: new Date()
        }
      });
    }

    if (options.json) printJson(report);
    else printReport(report);

    if (!gatePassed && !options.allowGateFailure) process.exitCode = 2;
  } catch (error) {
    if (runId) {
      await prisma.fantasyBacktestRun
        .update({
          where: { id: runId },
          data: {
            status: "FAILED",
            error: errorMessage(error).slice(0, 4000),
            completedAt: new Date()
          }
        })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

function beatsBaseline(metrics: { modelMae: number | null; baselineMae: number | null; modelRmse: number | null; baselineRmse: number | null }) {
  return (
    (metrics.modelMae !== null && metrics.baselineMae !== null && metrics.modelMae < metrics.baselineMae) ||
    (metrics.modelRmse !== null && metrics.baselineRmse !== null && metrics.modelRmse < metrics.baselineRmse)
  );
}

function modelVersionLabel(identity: Awaited<ReturnType<typeof getActiveScoringModelBundleForSource>>["identity"]) {
  const source = identity.configuredModelSource;
  const id = identity.configuredModelId ?? "built-in";
  return `${source}:${id}:v${identity.configuredModelVersion}`;
}

function parseCliOptions(args: string[]): CliOptions {
  const value = (name: string) => argValue(args, name);
  return {
    leagueId: parseBigInt(value("league") ?? value("league-id")),
    season: value("season"),
    expectedMatches: parseOptionalPositiveInteger(value("expected-matches")),
    historyMatches: parsePositiveInteger(value("history-matches"), 5),
    minimumHistory: parsePositiveInteger(value("minimum-history"), 3),
    minimumImprovementPercent: parseNonNegativeNumber(value("minimum-improvement-percent"), 10),
    requiredPassingPositions: parsePositiveInteger(value("required-passing-positions"), 3),
    minimumPositionSamples: parsePositiveInteger(value("minimum-position-samples"), 30),
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

function parseOptionalPositiveInteger(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid positive integer: ${value}`);
  return parsed;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  return value ? parseOptionalPositiveInteger(value) ?? fallback : fallback;
}

function parseNonNegativeNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid non-negative number: ${value}`);
  return parsed;
}

function printUsage() {
  console.log(`Usage:
  npm run model:backtest -- --league=47 --season=2024/2025 --expected-matches=380

Options:
  --history-matches=5              Rolling history window.
  --minimum-history=3              Prior appearances required before evaluation.
  --minimum-position-samples=30    Minimum evaluated samples in every position.
  --minimum-improvement-percent=10 Required MAE or RMSE improvement on the fixed five-observation horizon.
  --required-passing-positions=3   Positions that must reach the five-observation threshold.
  --no-persist                     Calculate without saving a database run.
  --allow-gate-failure             Return exit code 0 even when the beta gate fails.
  --json                           Print the machine-readable report.

The beta gate uses the preselected ridge19-v1 calibration and the final 25% rolling-origin holdout.
Next-observation and three-observation metrics are always reported but do not replace the five-observation gate.`);
}

function printReport(report: {
  runId: string | null;
  model: { name: string; version: string; hash: string };
  dataset: {
    leagueId: string;
    season: string;
    finishedMatches: number;
    expectedMatches: number | null;
    seasonComplete: boolean;
    playerStatRows: number;
  };
  summary: ReturnType<typeof runFantasyBacktest>["summary"];
  validation: {
    holdoutStartsAt: string;
    calibratedNextObservation: ReturnType<typeof runFantasyBacktest>["summary"];
  };
  betaGate: {
    primaryHorizon: number;
    passingPositions: readonly string[];
    nextObservationPassingPositions: readonly string[];
    passed: boolean;
    reasons: string[];
  };
}) {
  console.log(`[fantasy-backtest] ${report.dataset.leagueId} ${report.dataset.season}`);
  console.log(`[fantasy-backtest] Model: ${report.model.name} (${report.model.version}, sha256:${report.model.hash.slice(0, 12)})`);
  console.log(
    `[fantasy-backtest] Season: ${report.dataset.finishedMatches}/${report.dataset.expectedMatches ?? "?"} finished matches; complete=${report.dataset.seasonComplete}`
  );
  console.log(`[fantasy-backtest] Final holdout starts: ${report.validation.holdoutStartsAt}`);
  console.log("[fantasy-backtest] Calibrated next-observation metrics (reported, not the beta gate):");
  console.table(
    FANTASY_BACKTEST_POSITION_GROUPS.map((position) => ({
      position,
      ...report.validation.calibratedNextObservation.byPosition[position]
    }))
  );
  console.log(`[fantasy-backtest] Calibrated ${report.betaGate.primaryHorizon}-observation metrics (beta gate):`);
  console.log(`[fantasy-backtest] Evaluated horizon samples: ${report.summary.samples}; source player rows: ${report.dataset.playerStatRows}`);
  console.table(
    FANTASY_BACKTEST_POSITION_GROUPS.map((position) => ({
      position,
      ...report.summary.byPosition[position]
    }))
  );
  console.table(
    (["STABLE_STARTER", "UNCERTAIN_MINUTES", "OTHER"] as const).map((group) => ({
      group,
      ...report.summary.byPlayingTime[group]
    }))
  );
  console.log(`[fantasy-backtest] Saved run: ${report.runId ?? "no (no-persist)"}`);
  console.log(
    `[fantasy-backtest] Beta gate: ${report.betaGate.passed ? "PASS" : "FAIL"}; ${report.betaGate.primaryHorizon}-observation passing positions: ${report.betaGate.passingPositions.join(", ") || "none"}; next-observation passing positions: ${report.betaGate.nextObservationPassingPositions.join(", ") || "none"}`
  );
  for (const reason of report.betaGate.reasons) console.log(`[fantasy-backtest] Gate failure: ${reason}`);
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
