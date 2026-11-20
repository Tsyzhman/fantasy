/** @spec spec://modules/agents/FEAT-017-squad-workflows#squads */
import {
  buildTransferPlanSuggestions, fantasyCaptainMultiplier, fantasyPlanTransferRows, nextFantasyPoints, playerHorizonPoints,
  roundFantasyValue, roundForecastPoints, summarizeFantasySquad, updateFantasySquadRoundPlan,
  validateFantasyRoundPlansForSave, validateFantasySquadForSave,
  type FantasyPlannerPlayer, type FantasySquadRoundPlan, type FantasySquadRules, type FantasySquadSelection
} from "@/machete/squad_logic";
import type { Move } from "./definition";

export type PlanningContext = {
  pool: FantasyPlannerPlayer[];
  rules: FantasySquadRules;
  roundPlans: FantasySquadRoundPlan[];
  roundIds: string[];
  contestUpdatedAt: Date;
  forecastBlocked: boolean;
  storedBaseline: string[] | null;
  openingAvailable: number | null;
};
type Reason = { code: string; message: string };

function forecast(player: FantasyPlannerPlayer | undefined, horizon: number) {
  if (!player || player.isProviderPlaceholder) return null;
  if (horizon === 1 && (player.roundPoints.length || Number.isFinite(player.predictedFp))) return nextFantasyPoints(player);
  if (player.roundPoints.length < horizon) return null;
  return playerHorizonPoints(player, horizon);
}

function view(context: PlanningContext, selections: FantasySquadSelection[], horizon: number) {
  const byId = new Map(context.pool.map(player => [player.playerId, player]));
  const summary = summarizeFantasySquad(context.pool, selections, context.rules, horizon);
  const players = selections.map(selection => {
    const player = byId.get(selection.playerId);
    return {
      playerId: selection.playerId, name: player?.name ?? null, teamId: player?.teamId ?? null,
      position: player?.positionGroup ?? null, price: player?.price ?? null, isStarter: selection.isStarter,
      isCaptain: selection.isCaptain, isViceCaptain: selection.isViceCaptain, isLocked: selection.isLocked,
      projectedNext: forecast(player, 1), projectedHorizon: forecast(player, horizon)
    };
  });
  const starters = players.filter(player => player.isStarter);
  function points(field: "projectedNext" | "projectedHorizon") {
    let total = 0;
    for (const player of starters) {
      const value = player[field];
      if (value === null) return null;
      total += value * fantasyCaptainMultiplier(player);
    }
    return roundForecastPoints(total);
  }
  const priced = players.every(player => player.price !== null);
  return { players, budget: context.rules.budgetLimit, spent: priced ? summary.spent : null, bank: priced ? summary.bank : null,
    projectedNext: points("projectedNext"), projectedHorizon: points("projectedHorizon") };
}

type SquadView = ReturnType<typeof view>;
export type Preview = {
  accepted: boolean;
  horizon: number;
  moves: Move[];
  before: SquadView;
  after: SquadView | null;
  delta: { bank: number | null; projectedNext: number | null; projectedHorizon: number | null } | null;
  reasons: Reason[];
  transfersByRound: { used: number; available: number }[];
};

export type EvaluatedTransfers = { preview: Preview; plans: FantasySquadRoundPlan[] | null };

function refused(before: SquadView, horizon: number, moves: Move[], reason: Reason, after: SquadView | null = null): EvaluatedTransfers {
  return { plans: null, preview: { accepted: false, horizon, moves, before, after, delta: null, reasons: [reason], transfersByRound: [] } };
}

function difference(after: number | null, before: number | null) {
  return after === null || before === null ? null : roundForecastPoints(after - before);
}

export function previewTransfers(context: PlanningContext, moves: Move[], horizon: number): EvaluatedTransfers {
  const selections = context.roundPlans[0].selections;
  const byId = new Map(context.pool.map(player => [player.playerId, player]));
  const selected = new Map(selections.map(selection => [selection.playerId, selection]));
  const replacements = new Map<string, FantasyPlannerPlayer>();
  const incomingIds = new Set<string>();
  const before = view(context, selections, horizon);
  const reject = (code: string, message: string) => refused(before, horizon, moves, { code, message });
  for (const move of moves) {
    const out = selected.get(move.outPlayerId);
    const incoming = byId.get(move.inPlayerId);
    if (!out) return reject("PLAYER_NOT_IN_SQUAD", "The outgoing player is absent from this squad.");
    if (out.isLocked) return reject("PLAYER_LOCKED", "The outgoing player is locked.");
    if (selected.has(move.inPlayerId) || incomingIds.has(move.inPlayerId) || replacements.has(move.outPlayerId)) {
      return reject("DUPLICATE_PLAYER", "Each move must replace a distinct player with a new player.");
    }
    if (!incoming || incoming.isProviderPlaceholder || !byId.has(out.playerId)) return reject("PLAYER_UNAVAILABLE", "A player is unavailable in this contest.");
    if (incoming.positionGroup !== byId.get(out.playerId)!.positionGroup) return reject("POSITION_MISMATCH", "The replacement must fill the outgoing player's position.");
    replacements.set(move.outPlayerId, incoming);
    incomingIds.add(move.inPlayerId);
  }
  const updated = selections.map(selection => {
    const incoming = replacements.get(selection.playerId);
    return incoming ? { ...selection, playerId: incoming.playerId, purchasePrice: incoming.price } : selection;
  });
  const plans = updateFantasySquadRoundPlan(context.roundPlans, 0, updated);
  const validation = validateFantasyRoundPlansForSave({
    plans, rules: context.rules, pool: context.pool, previousSelections: selections,
    storedBaseline: context.storedBaseline, openingAvailable: context.openingAvailable
  });
  const after = view(context, updated, horizon);
  if (!validation.ok) return refused(before, horizon, moves, { code: validation.code, message: validation.message }, after);
  // Only linked rounds inherit the proposed change. Keep independent future drafts byte-for-byte where possible.
  let linked = true;
  const savedPlans = validation.roundPlans.map((plan, index) => {
    if (index > 0 && !plan.linkedToPrevious) linked = false;
    return linked ? plan : context.roundPlans[index];
  });
  return { plans: savedPlans, preview: { accepted: true, horizon, moves, before, after,
    delta: { bank: after.bank === null || before.bank === null ? null : roundFantasyValue(after.bank - before.bank),
      projectedNext: difference(after.projectedNext, before.projectedNext), projectedHorizon: difference(after.projectedHorizon, before.projectedHorizon) },
    reasons: [], transfersByRound: validation.transferRows } };
}

export function proposeTransfers(context: PlanningContext, maxTransfers: number, horizon: number): EvaluatedTransfers {
  const { pool, rules } = context;
  const selections = context.roundPlans[0].selections;
  const before = view(context, selections, horizon);
  const decline = (code: string, message: string) => refused(before, horizon, [], { code, message });
  if (!context.roundIds.length || context.forecastBlocked || before.projectedHorizon === null) {
    return decline("FORECAST_UNAVAILABLE", "The planner has no usable lineup forecast for this horizon.");
  }
  const valid = validateFantasySquadForSave({ pool, selections, rules, horizon });
  if (!valid.ok) return decline("INVALID_SQUAD", valid.error);
  if (selections.every(player => player.isLocked)) return decline("PLAYER_LOCKED", "All players in the squad are locked.");
  const selected = new Set(selections.map(selection => selection.playerId));
  const candidates = pool.filter(player => forecast(player, horizon) !== null && !player.isProviderPlaceholder);
  if (candidates.every(player => selected.has(player.playerId))) return decline("NO_FORECAST_CANDIDATE", "No available incoming player has a forecast for this horizon.");
  const firstIndependent = context.roundPlans.findIndex((plan, index) => index > 0 && !plan.linkedToPrevious);
  const transferScope = { rules, previousSelections: selections, storedBaseline: context.storedBaseline, openingAvailable: context.openingAvailable };
  let blockedRound = -1;
  const options = buildTransferPlanSuggestions({
    pool: pool.filter(player => selected.has(player.playerId) || forecast(player, horizon) !== null),
    selections, rules, horizon, transferCount: maxTransfers, maximumPlans: 12,
    acceptSelections(next) {
      const plans = context.roundPlans.map((plan, index) => firstIndependent < 0 || index < firstIndependent ? { selections: next } : plan);
      const exceeded = fantasyPlanTransferRows(transferScope, plans).findIndex(row => row.used > row.available);
      if (exceeded !== -1) blockedRound = exceeded;
      return exceeded === -1;
    }
  });
  let firstRejected: EvaluatedTransfers | undefined;
  for (const option of options) {
    const moves = option.moves.map(({ outPlayerId, inPlayerId }) => ({ outPlayerId, inPlayerId }));
    const evaluated = previewTransfers(context, moves, horizon);
    if (evaluated.preview.accepted) return evaluated;
    firstRejected ??= evaluated;
  }
  if (firstRejected) return firstRejected;
  if (blockedRound !== -1) return decline("TRANSFER_LIMIT", `An improving plan would exceed the transfer allowance in round +${blockedRound}.`);
  return decline("NO_IMPROVING_TRANSFER", "No eligible transfer plan improves the projected lineup within the squad rules.");
}
