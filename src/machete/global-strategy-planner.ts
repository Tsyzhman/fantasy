/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
/** @spec spec://modules/machete/FEAT-002-global-strategy-formula#contracts */
import { evaluateGlobalStrategy, evaluateGlobalStrategyPlan, scoreGlobalStrategyPlayer, unavailableGlobalStrategy, validGlobalOwnership, GLOBAL_STRATEGY_EPSILON,
  type GlobalStrategyEvaluation, type GlobalStrategyPlanScore, type GlobalStrategyRequestContext } from "./global-strategy";
import { optimizeFantasySquadWithScores, optimizeFantasyStarters, summarizeFantasySquad, consensusRoundFantasyPoints, buildTransferPlanSuggestions,
  type FantasyPlannerPlayer, type FantasySquadSelection, type FantasySquadOptimizationInput, type TransferPlanSuggestion, type TransferSuggestionForecastSource, type FantasySquadRules } from "./squad_logic";

export type GlobalStrategyAnalysis = {
  inputSignature?: string;
  sourceRevisions?: { ownership: string; forecast: string; config: string };
  roundExposures?: { baseline: { playerId: string; multiplier: number }[][]; candidate: { playerId: string; multiplier: number }[][] };
  evaluation: GlobalStrategyEvaluation;
  baselineExpectedPoints: number;
  candidateExpectedPoints: number;
  expectedPointsLoss: number;
  maxExpectedPointsLoss: number;
  strategyScoreDelta: number;
  contextRevision: string | null;
  policy: "PER_ROUND_XI_CAPTAIN_ZERO_BENCH";
};
export type GlobalSquadResult = { selections: FantasySquadSelection[] | null; analysis: GlobalStrategyAnalysis | null };

/** Recheck at application time: the request may expire while the Worker is running. */
export function isGlobalRecommendationCurrent(analysis: GlobalStrategyAnalysis, request: GlobalStrategyRequestContext | null | undefined, now: number): boolean {
  if (analysis.evaluation.status === "UNAVAILABLE" || analysis.evaluation.status === "FINISHED") return true; // Ordinary fallback has no strategic exposure.
  if (!request || !Number.isFinite(now)) return false;
  return analysis.contextRevision === request.context.revision
    && analysis.sourceRevisions?.ownership === request.ownershipRevision
    && analysis.sourceRevisions?.forecast === request.forecastRevision
    && analysis.sourceRevisions?.config === request.config.version
    && now < Date.parse(request.context.expiresAt) && now < Date.parse(request.ownershipExpiresAt);
}
type ScoredPlan = GlobalStrategyPlanScore & { selections: FantasySquadSelection[]; id: string; penalty: number; moves: number; rounds: number[]; exposures: { playerId: string; multiplier: number }[][] };
type Scorer = (player: FantasyPlannerPlayer, round: number) => number;

export function globalStrategyPoolEvaluation(pool: readonly FantasyPlannerPlayer[], request: GlobalStrategyRequestContext | null | undefined, now: number): GlobalStrategyEvaluation {
  if (!request) return unavailableGlobalStrategy("unavailable", "CONTEXT_REQUIRED");
  const evaluation = evaluateGlobalStrategy(request.context, request.config, now);
  if (evaluation.status !== "READY" && evaluation.status !== "NEUTRAL") return evaluation;
  if (!request.ownershipRevision || !request.forecastRevision || !Number.isFinite(Date.parse(request.ownershipExpiresAt)) || now >= Date.parse(request.ownershipExpiresAt)) return unavailableGlobalStrategy(request.config.version, "STALE_OWNERSHIP", request.context.revision);
  if (pool.some((player) => player.priceSource !== request.context.provider)) return unavailableGlobalStrategy(request.config.version, "PROVIDER_MISMATCH", request.context.revision);
  if (pool.some((player) => !player.providerPlayerId || player.isProviderPlaceholder)) return unavailableGlobalStrategy(request.config.version, "INCOMPLETE_PLAYER_MAPPING", request.context.revision);
  if (pool.some((player) => !validGlobalOwnership(ownership(player, request)))) return unavailableGlobalStrategy(request.config.version, "INCOMPLETE_OWNERSHIP", request.context.revision);
  return evaluation;
}

function ownership(player: FantasyPlannerPlayer, request: GlobalStrategyRequestContext) {
  return request.ownershipByProviderPlayerId ? request.ownershipByProviderPlayerId[player.providerPlayerId ?? ""] : player.ownershipPercent;
}
function scorers(request: GlobalStrategyRequestContext, evaluation: GlobalStrategyEvaluation, source?: TransferSuggestionForecastSource): { ep: Scorer; score: Scorer } {
  const ep: Scorer = (player, round) => {
    const value = source === "FFO" ? round === 0 ? player.foontasyPoints : null
      : source === "ALT" ? player.alternativeRoundPoints?.[round] ?? (round === 0 ? player.alternativePredictedFp : null)
      : source === "FO" ? player.roundPoints[round] ?? (round === 0 ? player.predictedFp : null)
      : consensusRoundFantasyPoints(player, round);
    return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
  };
  return { ep, score: (player, round) => scoreGlobalStrategyPlayer({ expectedPoints: ep(player, round), ownershipPercent: ownership(player, request) ?? null }, evaluation, request.config).strategyScore };
}

// Future rounds use the same explicit policy in both passes: select XI and captain for that round;
// locked starters/bench persist, bench EP is zero, ordinary captain multiplier is two. No autosub model.
function scoreRoster(pool: FantasyPlannerPlayer[], roster: FantasySquadSelection[], rules: FantasySquadRules, horizon: number, ep: Scorer, strategy: Scorer, select: Scorer, penalty = 0, moves = 0): ScoredPlan | null {
  const byId = new Map(pool.map((player) => [player.playerId, player]));
  const selectedPool = roster.map((selection) => byId.get(selection.playerId)).filter((player): player is FantasyPlannerPlayer => Boolean(player));
  if (selectedPool.length !== roster.length || selectedPool.some((player) => Array.from({ length: horizon }, (_, round) => ep(player, round)).some((value) => !Number.isFinite(value)))) return null;
  let expectedPoints = -penalty;
  let strategyScore = -penalty;
  let first = roster;
  const rounds: number[] = [];
  const exposures: ScoredPlan["exposures"] = [];
  for (let round = 0; round < horizon; round += 1) {
    const xi = optimizeFantasyStarters({ pool: selectedPool, selections: roster.map((selection) => ({ ...selection, isCaptain: false, isViceCaptain: false })), rules, horizon: 1, strategy: "balanced", respectLocks: true }, (player) => select(player, round));
    if (!xi) return null;
    const starters = xi.filter((selection) => selection.isStarter).sort((a, b) => select(byId.get(b.playerId)!, round) - select(byId.get(a.playerId)!, round) || a.playerId.localeCompare(b.playerId));
    const captainId = starters[0]?.playerId;
    const viceId = starters[1]?.playerId;
    exposures.push(starters.map((selection) => ({ playerId: selection.playerId, multiplier: selection.playerId === captainId ? 2 : 1 })));
    let roundEp = 0;
    for (const selection of starters) {
      const player = byId.get(selection.playerId)!;
      const multiplier = selection.playerId === captainId ? 2 : 1;
      roundEp += multiplier * ep(player, round);
      strategyScore += multiplier * strategy(player, round);
    }
    expectedPoints += roundEp;
    rounds.push(roundEp);
    if (round === 0) first = xi.map((selection) => ({ ...selection, isCaptain: selection.playerId === captainId, isViceCaptain: selection.playerId === viceId }));
  }
  return { expectedPoints, strategyScore, selections: first, penalty, moves, rounds, exposures, id: roster.map((selection) => selection.playerId).sort().join(":") + ":" + first.find((selection) => selection.isCaptain)?.playerId };
}
function compareEp(a: ScoredPlan, b: ScoredPlan) { return b.expectedPoints - a.expectedPoints || a.penalty - b.penalty || a.moves - b.moves || a.id.localeCompare(b.id); }
function compareStrategy(a: ScoredPlan, b: ScoredPlan) { return b.strategyScore - a.strategyScore || compareEp(a, b); }
function signature(input: { selections?: FantasySquadSelection[]; rules: FantasySquadRules; horizon: number; maximumTransfers?: number; freeTransfers?: number | null; paidTransferPointCost?: number | null; excludedPlayerIds?: Iterable<string> }, source: string) {
  return JSON.stringify([source, input.rules, input.horizon, input.selections, input.maximumTransfers, input.freeTransfers, input.paidTransferPointCost, [...(input.excludedPlayerIds ?? [])].sort()]);
}
function analysis(baseline: ScoredPlan, candidate: ScoredPlan, evaluation: GlobalStrategyEvaluation, request: GlobalStrategyRequestContext, inputSignature: string): GlobalStrategyAnalysis {
  const compared = evaluateGlobalStrategyPlan({ baseline, candidate }, evaluation, request.config);
  return { evaluation, baselineExpectedPoints: baseline.expectedPoints, candidateExpectedPoints: candidate.expectedPoints,
    inputSignature,
    sourceRevisions: { ownership: request.ownershipRevision, forecast: request.forecastRevision, config: request.config.version },
    roundExposures: { baseline: baseline.exposures, candidate: candidate.exposures },
    expectedPointsLoss: compared.expectedPointsLoss, maxExpectedPointsLoss: compared.maxExpectedPointsLoss, strategyScoreDelta: compared.strategyScoreDelta,
    contextRevision: request.context.revision, policy: "PER_ROUND_XI_CAPTAIN_ZERO_BENCH" };
}

export function optimizeGlobalSquad(input: FantasySquadOptimizationInput, now: number, startersOnly = false): GlobalSquadResult {
  const request = input.globalStrategy;
  const excluded = new Set(input.excludedPlayerIds);
  const pool = input.pool.filter((player) => !excluded.has(player.playerId));
  const evaluation = globalStrategyPoolEvaluation(pool, request, now);
  const fallback = () => startersOnly ? optimizeFantasyStarters({ ...input, selections: input.selections ?? [], strategy: "balanced" }) : optimizeFantasySquadWithScores({ ...input, strategy: "balanced" });
  if (!request || (evaluation.status !== "READY" && evaluation.status !== "NEUTRAL")) return { selections: fallback(), analysis: { evaluation, baselineExpectedPoints: 0, candidateExpectedPoints: 0, expectedPointsLoss: 0, maxExpectedPointsLoss: 0, strategyScoreDelta: 0, contextRevision: evaluation.contextRevision, policy: "PER_ROUND_XI_CAPTAIN_ZERO_BENCH" } };
  const horizon = input.basis === "next" ? 1 : Math.max(1, Math.floor(input.horizon));
  const { ep, score } = scorers(request, evaluation);
  if (!startersOnly && input.selections?.length === input.rules.squadSize && Number.isSafeInteger(input.maximumTransfers) && input.maximumTransfers! >= 0) {
    const noop = scoreRoster(pool, input.selections, input.rules, horizon, ep, score, ep);
    if (!noop) return { selections: null, analysis: null };
    const plans = buildGlobalTransferSuggestions({ pool, selections: input.selections, rules: input.rules, horizon, transferCount: input.maximumTransfers!,
      freeTransfers: input.freeTransfers ?? input.maximumTransfers!, paidTransferPointCost: input.paidTransferPointCost ?? 0, globalStrategy: request, forecastSource: undefined }, now, true);
    const best = plans[0];
    return best ? { selections: best.selections!, analysis: best.globalStrategy! } : { selections: noop.selections, analysis: analysis(noop, noop, evaluation, request, signature(input, "CONSENSUS")) };
  }
  if (pool.some((player) => Array.from({ length: horizon }, (_, round) => ep(player, round)).some((value) => !Number.isFinite(value)))) {
    return { selections: fallback(), analysis: { evaluation: unavailableGlobalStrategy(request.config.version, "INCOMPLETE_FORECAST", request.context.revision), baselineExpectedPoints: 0, candidateExpectedPoints: 0, expectedPointsLoss: 0, maxExpectedPointsLoss: 0, strategyScoreDelta: 0, contextRevision: request.context.revision, policy: "PER_ROUND_XI_CAPTAIN_ZERO_BENCH" } };
  }
  const sum = (scorer: Scorer) => (player: FantasyPlannerPlayer) => Array.from({ length: horizon }, (_, round) => scorer(player, round)).reduce((a, b) => a + b, 0);
  const baseRoster = startersOnly ? input.selections ?? [] : optimizeFantasySquadWithScores({ ...input, pool, strategy: "balanced" }, sum(ep));
  if (!baseRoster) return { selections: null, analysis: null };
  const strategyRoster = startersOnly || evaluation.k === 0 ? baseRoster : optimizeFantasySquadWithScores({ ...input, pool, strategy: "balanced" }, sum(score));
  const candidates: ScoredPlan[] = [];
  for (const roster of [baseRoster, strategyRoster]) {
    if (!roster) continue;
    for (const selector of evaluation.k === 0 ? [ep] : [ep, score]) {
      const plan = scoreRoster(pool, roster, input.rules, horizon, ep, score, selector);
      if (plan) candidates.push(plan);
    }
  }
  const baseline = [...candidates].sort(compareEp)[0];
  if (!baseline) return { selections: null, analysis: null };
  const candidate = candidates.filter((plan) => evaluateGlobalStrategyPlan({ baseline, candidate: plan }, evaluation, request.config).eligible).sort(compareStrategy)[0] ?? baseline;
  return { selections: candidate.selections, analysis: analysis(baseline, candidate, evaluation, request, signature(input, "CONSENSUS")) };
}

type TransferInput = { pool: FantasyPlannerPlayer[]; selections: FantasySquadSelection[]; rules: FantasySquadRules; horizon: number; forecastSource?: TransferSuggestionForecastSource; transferCount: number; maximumPlans?: number; freeTransfers?: number | null; paidTransferPointCost?: number | null; globalStrategy?: GlobalStrategyRequestContext | null };
export function buildGlobalTransferSuggestions(input: TransferInput, now: number, useConsensus = false): TransferPlanSuggestion[] {
  const request = input.globalStrategy;
  const evaluation = globalStrategyPoolEvaluation(input.pool, request, now);
  if (!request || (evaluation.status !== "READY" && evaluation.status !== "NEUTRAL")) return buildTransferPlanSuggestions({ ...input, strategy: "balanced" });
  if (!Number.isSafeInteger(input.freeTransfers) || input.freeTransfers! < 0 || !Number.isFinite(input.paidTransferPointCost) || input.paidTransferPointCost! < 0) return [];
  const source = input.forecastSource ?? "FO";
  const horizon = source === "FFO" ? 1 : Math.max(1, Math.floor(input.horizon));
  const { ep, score } = scorers(request, evaluation, useConsensus ? undefined : source);
  const noop = scoreRoster(input.pool, input.selections, input.rules, horizon, ep, score, ep);
  if (!noop) return [];
  const initialIds = new Set(input.selections.map((selection) => selection.playerId));
  const byId = new Map(input.pool.map((player) => [player.playerId, player]));
  const sum = (scorer: Scorer, player: FantasyPlannerPlayer) => Array.from({ length: horizon }, (_, round) => scorer(player, round)).reduce((a, b) => a + b, 0);
  const options = new Map<string, FantasyPlannerPlayer[]>();
  for (const position of ["GK", "DEF", "MID", "FWD"]) {
    const pool = input.pool.filter((player) => !initialIds.has(player.playerId) && player.positionGroup === position && Number.isFinite(sum(ep, player)));
    const byEp = [...pool].sort((a, b) => sum(ep, b) - sum(ep, a) || a.playerId.localeCompare(b.playerId)).slice(0, 8);
    const byScore = [...pool].sort((a, b) => sum(score, b) - sum(score, a) || a.playerId.localeCompare(b.playerId)).slice(0, 8);
    options.set(position, [...new Map([...byEp, ...byScore].map((player) => [player.playerId, player])).values()]);
  }
  const seen = new Set<string>();
  let beam: ScoredPlan[] = [noop];
  const retained: ScoredPlan[] = [noop];
  let baseline = noop;
  // Bounded beam retains EP and strategy alternatives separately; no-op and the best observed EP never disappear.
  const maximumMoves = Math.min(3, Math.max(0, Math.floor(input.transferCount)));
  for (let depth = 1; depth <= maximumMoves; depth += 1) {
    const next: (ScoredPlan & { feasible: boolean })[] = [];
    for (const previous of beam) {
      const selected = new Set(previous.selections.map((selection) => selection.playerId));
      for (const outgoing of previous.selections.filter((selection) => !selection.isLocked && initialIds.has(selection.playerId))) {
        for (const incoming of options.get(byId.get(outgoing.playerId)!.positionGroup) ?? []) {
          if (selected.has(incoming.playerId)) continue;
          const roster = previous.selections.map((selection) => selection.playerId === outgoing.playerId ? { ...selection, playerId: incoming.playerId, purchasePrice: incoming.price, isLocked: false } : selection);
          const key = roster.map((selection) => selection.playerId).sort().join(":");
          if (seen.has(key)) continue;
          seen.add(key);
          const summary = summarizeFantasySquad(input.pool, roster, input.rules, horizon);
          const feasible = summary.violations.length === 0;
          if (!feasible && depth === maximumMoves) continue;
          // A linked pair may temporarily exceed budget or club caps. Only final legal rosters
          // enter the baseline/result; relaxed intermediate nodes cannot be recommended.
          const searchRules = feasible ? input.rules : { ...input.rules, budgetLimit: Math.max(input.rules.budgetLimit, summary.spent), maxPlayersPerTeam: input.rules.squadSize };
          const penalty = Math.max(0, depth - input.freeTransfers!) * input.paidTransferPointCost!;
          for (const selector of evaluation.k === 0 ? [ep] : [ep, score]) {
            const plan = scoreRoster(input.pool, roster, searchRules, horizon, ep, score, selector, penalty, depth);
            if (!plan) continue;
            if (feasible && compareEp(plan, baseline) < 0) baseline = plan;
            next.push({ ...plan, feasible });
          }
        }
      }
    }
    const legal = next.filter((plan) => plan.feasible);
    beam = [...new Map([...legal.sort(compareEp).slice(0, 12), ...legal.sort(compareStrategy).slice(0, 12), ...next.sort(compareEp).slice(0, 12), ...next.sort(compareStrategy).slice(0, 12)].map((plan) => [plan.id, plan])).values()];
    const legalIds = new Set(legal.map((plan) => plan.id));
    retained.push(...beam.filter((plan) => legalIds.has(plan.id)));
    if (!beam.length) break;
  }
  retained.push(baseline);
  const noopComparison = evaluateGlobalStrategyPlan({ baseline, candidate: noop }, evaluation, request.config);
  const noopExceedsBudget = noopComparison.expectedPointsLoss > noopComparison.maxExpectedPointsLoss + GLOBAL_STRATEGY_EPSILON;
  const selected = [...new Map(retained.filter((plan) => (plan.moves > 0 || useConsensus) && (plan === baseline || evaluateGlobalStrategyPlan({ baseline, candidate: plan }, evaluation, request.config).eligible))
    .filter((plan) => plan.strategyScore > noop.strategyScore + GLOBAL_STRATEGY_EPSILON || (useConsensus && plan.moves === 0) || (plan === baseline && noopExceedsBudget))
    .sort(compareStrategy).map((plan) => [plan.id, plan])).values()].slice(0, input.maximumPlans ?? 6);
  const originalCost = input.selections.reduce((sum, selection) => sum + byId.get(selection.playerId)!.price, 0);
  return selected.map((plan) => {
    const changed = plan.selections.filter((selection) => !initialIds.has(selection.playerId));
    const finalIds = new Set(plan.selections.map((selection) => selection.playerId));
    const outgoing = input.selections.filter((selection) => !finalIds.has(selection.playerId));
    const available = [...changed];
    const moves = outgoing.map((selection) => {
      const out = byId.get(selection.playerId)!;
      const index = available.findIndex((candidate) => byId.get(candidate.playerId)!.positionGroup === out.positionGroup);
      const incoming = byId.get(available.splice(index, 1)[0].playerId)!;
      return { outPlayerId: out.playerId, inPlayerId: incoming.playerId, outName: out.name, inName: incoming.name, positionGroup: out.positionGroup,
        outTeamName: out.teamName, inTeamName: incoming.teamName, priceDelta: incoming.price - out.price, round1Delta: ep(incoming, 0) - ep(out, 0), round3Delta: null, round5Delta: null };
    });
    const cost = plan.selections.reduce((sum, selection) => sum + byId.get(selection.playerId)!.price, 0);
    const details = analysis(baseline, plan, evaluation, request, signature({ ...input, maximumTransfers: input.transferCount }, useConsensus ? "CONSENSUS" : source));
    return { id: plan.id, forecastSource: source, moves, transferCount: moves.length, priorityReplacementCount: 0, captainPlayerId: plan.selections.find((selection) => selection.isCaptain)?.playerId ?? null,
      priceDelta: cost - originalCost, squadCostAfter: cost, bankAfter: input.rules.budgetLimit - cost, round1Delta: plan.rounds[0] - noop.rounds[0], round3Delta: null, round5Delta: null,
      horizonDelta: plan.expectedPoints + plan.penalty - noop.expectedPoints, paidTransferLoss: plan.penalty, netHorizonDelta: plan.expectedPoints - noop.expectedPoints,
      reason: `По глобальному рейтингу: EP ${plan.expectedPoints.toFixed(2)}, база ${baseline.expectedPoints.toFixed(2)}, потеря ${Math.max(0, details.expectedPointsLoss).toFixed(2)} / ${details.maxExpectedPointsLoss.toFixed(2)}.`,
      risks: details.expectedPointsLoss > GLOBAL_STRATEGY_EPSILON ? ["Потеря ожидаемых очков ради стратегии"] : [], score: plan.strategyScore, globalStrategy: details, selections: plan.selections };
  });
}
