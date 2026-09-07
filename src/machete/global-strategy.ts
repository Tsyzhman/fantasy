/** @spec spec://modules/machete/FEAT-002-global-strategy-formula#contracts
 * @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { validGlobalStrategyConfig, type GlobalStrategyConfig, type GlobalStrategyProvider } from "./global-strategy-config";

export const GLOBAL_STRATEGY_EPSILON = 1e-7;
export type GlobalStrategyContext = {
  provider: GlobalStrategyProvider;
  contestId: string;
  tournamentKey: string;
  season: string;
  providerSquadId: string;
  revision: string;
  fieldSize: number;
  rank: number;
  managerPoints: number;
  leaderPoints: number;
  totalRounds: number;
  remainingRounds: number;
  roundScoreScale: number;
  scoreSampleCount: number;
  standingsRoundId: string;
  decisionRoundId?: string;
  observedAt: string;
  expiresAt: string;
};
export type GlobalStrategyEvaluation = {
  status: "READY" | "NEUTRAL" | "UNAVAILABLE" | "FINISHED";
  k: number | null;
  configVersion: string;
  contextRevision: string | null;
  rankRisk: number | null;
  gapRisk: number | null;
  urgency: number | null;
  maxLossFraction: number;
  reasonCodes: string[];
};
export type GlobalStrategyRequestContext = {
  context: GlobalStrategyContext;
  config: GlobalStrategyConfig;
  ownershipRevision: string;
  forecastRevision: string;
  ownershipExpiresAt: string;
  ownershipByProviderPlayerId?: Record<string, number>;
};
export type GlobalStrategyPlanScore = { expectedPoints: number; strategyScore: number };
export type GlobalStrategyPlanComparison = {
  eligible: boolean;
  expectedPointsLoss: number;
  maxExpectedPointsLoss: number;
  strategyScoreDelta: number;
  reasonCodes: string[];
};

export function unavailableGlobalStrategy(configVersion: string, reason: string, revision: string | null = null): GlobalStrategyEvaluation {
  return { status: "UNAVAILABLE", k: null, configVersion, contextRevision: revision, rankRisk: null,
    gapRisk: null, urgency: null, maxLossFraction: 0, reasonCodes: [reason] };
}

export function evaluateGlobalStrategy(context: GlobalStrategyContext, config: GlobalStrategyConfig, now: Date | number): GlobalStrategyEvaluation {
  const invalid = (reason: string) => unavailableGlobalStrategy(config.version, reason, context.revision);
  if (!validGlobalStrategyConfig(config)) return invalid("INVALID_CONFIG");
  const time = Number(now);
  const observed = Date.parse(context.observedAt);
  const expires = Date.parse(context.expiresAt);
  const { fieldSize: n, rank, totalRounds: t, remainingRounds: r, managerPoints, leaderPoints } = context;
  if (context.provider !== config.provider || context.tournamentKey !== config.tournamentKey
    || !context.contestId || !context.season || !context.providerSquadId || !context.revision || !context.standingsRoundId
    || ![n, rank, t, r, context.scoreSampleCount].every(Number.isSafeInteger)
    || n < 1 || rank < 1 || rank > n || t < 1 || r < 0 || r > t || context.scoreSampleCount < 0 || context.scoreSampleCount > 6
    || ![managerPoints, leaderPoints, time, observed, expires].every(Number.isFinite)
    || leaderPoints < managerPoints || (rank === 1 && leaderPoints !== managerPoints)
    || observed > time || expires <= observed) return invalid("INVALID_INPUT");
  if (time >= expires) return invalid("STALE_CONTEXT");
  const neutral = (status: "NEUTRAL" | "FINISHED", reason: string): GlobalStrategyEvaluation => ({
    status, k: 0, configVersion: config.version, contextRevision: context.revision,
    rankRisk: 0, gapRisk: 0, urgency: 0, maxLossFraction: 0, reasonCodes: [reason]
  });
  if (r === 0) return neutral("FINISHED", "NO_AVAILABLE_ROUNDS");
  if (n === 1 || leaderPoints === managerPoints || t === r) return neutral("NEUTRAL", "NEUTRAL_STRATEGY");
  if (!Number.isFinite(context.roundScoreScale) || context.roundScoreScale <= 0 || context.scoreSampleCount === 0) {
    return invalid("INSUFFICIENT_SCORE_HISTORY");
  }
  const gap = leaderPoints - managerPoints;
  const rankRisk = (rank - 1) / (n - 1);
  const gapRisk = 1 / (1 + config.gapScaleRounds * context.roundScoreScale / gap);
  const urgency = Math.min(1, (t - r) / Math.max(t - 1, 1)) ** config.urgencyExponent;
  const k = Math.min(config.kMax, config.kMax * urgency * (config.rankWeight * rankRisk + config.gapWeight * gapRisk));
  if (![gap, gapRisk, urgency, k].every(Number.isFinite)) return invalid("INVALID_INPUT");
  return { status: k === 0 ? "NEUTRAL" : "READY", k, configVersion: config.version, contextRevision: context.revision,
    rankRisk, gapRisk, urgency, maxLossFraction: config.maxExpectedPointsLossFraction * k / config.kMax,
    reasonCodes: context.scoreSampleCount < 3 ? ["SMALL_SCORE_SAMPLE"] : [] };
}

export function validGlobalOwnership(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function scoreGlobalStrategyPlayer(input: { expectedPoints: number; ownershipPercent: number | null }, evaluation: GlobalStrategyEvaluation, config: GlobalStrategyConfig) {
  const usable = validGlobalStrategyConfig(config) && evaluation.configVersion === config.version
    && (evaluation.status === "READY" || evaluation.status === "NEUTRAL") && evaluation.k !== null
    && Number.isFinite(evaluation.k) && evaluation.k >= 0 && evaluation.k <= config.kMax;
  const strategyBonus = usable && Number.isFinite(input.expectedPoints) && validGlobalOwnership(input.ownershipPercent)
    ? config.ownershipBonusScale * evaluation.k! * Math.max(input.expectedPoints, 0) * (1 - input.ownershipPercent / 100) : 0;
  return { expectedPoints: input.expectedPoints, strategyBonus, strategyScore: input.expectedPoints + strategyBonus };
}

export function evaluateGlobalStrategyPlan(input: { baseline: GlobalStrategyPlanScore; candidate: GlobalStrategyPlanScore }, evaluation: GlobalStrategyEvaluation, config: GlobalStrategyConfig): GlobalStrategyPlanComparison {
  const loss = input.baseline.expectedPoints - input.candidate.expectedPoints;
  const delta = input.candidate.strategyScore - input.baseline.strategyScore;
  const valid = validGlobalStrategyConfig(config) && evaluation.configVersion === config.version
    && evaluation.k !== null && Number.isFinite(evaluation.k) && evaluation.k >= 0 && evaluation.k <= config.kMax
    && (evaluation.status === "READY" || evaluation.status === "NEUTRAL")
    && [input.baseline.expectedPoints, input.candidate.expectedPoints, input.baseline.strategyScore, input.candidate.strategyScore].every(Number.isFinite);
  const maxExpectedPointsLoss = valid ? config.maxExpectedPointsLossFraction * evaluation.k! / config.kMax * Math.max(input.baseline.expectedPoints, 0) : 0;
  const reasonCodes = !valid ? ["INVALID_INPUT"] : loss > maxExpectedPointsLoss + GLOBAL_STRATEGY_EPSILON ? ["EXPECTED_POINTS_LOSS_EXCEEDED"] : delta <= GLOBAL_STRATEGY_EPSILON ? ["NO_STRATEGIC_GAIN"] : [];
  return { eligible: reasonCodes.length === 0, expectedPointsLoss: loss, maxExpectedPointsLoss, strategyScoreDelta: delta, reasonCodes };
}

/** Zero and negative completed scores are observations; the caller supplies completed rounds only. */
export function globalStrategyScoreHistory(rounds: readonly { id: string; score: number }[]) {
  const unique = new Map<string, number>();
  for (const round of rounds) {
    if (!round.id || !Number.isFinite(round.score) || unique.has(round.id)) return null;
    unique.set(round.id, round.score);
  }
  const used = [...unique].slice(-6);
  return { sampleCount: used.length, usedRoundIds: used.map(([id]) => id),
    roundScoreScale: used.length ? used.reduce((sum, [, score]) => sum + score, 0) / used.length : 0 };
}
