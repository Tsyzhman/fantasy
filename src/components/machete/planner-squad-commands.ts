"use client";
/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { orderSquadSelectionsWithBenchGoalkeeperLast } from "@/components/machete/fantasy-squad-ui";
import { canStartFantasyPlayer, createFantasySquadRoundPlans, playerHorizonPoints, summarizeFantasySquad, type FantasyPlannerPlayer, type FantasySquadRules, type FantasySquadRoundPlan, type FantasySquadSelection } from "@/machete/squad_logic";

export type StoredSquadCaptains = {
  captainId: string | null;
  viceCaptainId: string | null;
};

export function readStoredSquadCaptains(storageKey: string, selectedPlayerIds: Set<string>): StoredSquadCaptains {
  if (typeof window === "undefined") return { captainId: null, viceCaptainId: null };

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Partial<StoredSquadCaptains>;
    const captainId = typeof parsed.captainId === "string" && selectedPlayerIds.has(parsed.captainId) ? parsed.captainId : null;
    const viceCaptainId =
      typeof parsed.viceCaptainId === "string" && selectedPlayerIds.has(parsed.viceCaptainId) && parsed.viceCaptainId !== captainId
        ? parsed.viceCaptainId
        : null;

    return { captainId, viceCaptainId };
  } catch {
    return { captainId: null, viceCaptainId: null };
  }
}

export function writeStoredSquadCaptains(storageKey: string, captains: StoredSquadCaptains) {
  if (typeof window === "undefined") return;

  if (!captains.captainId && !captains.viceCaptainId) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(captains));
}

export function withCaptainState(selections: FantasySquadSelection[], captainId: string | null, viceCaptainId: string | null) {
  return sanitizeCaptainRoles(
    selections.map((selection) => ({
      ...selection,
      isCaptain: selection.playerId === captainId,
      isViceCaptain: selection.playerId === viceCaptainId && selection.playerId !== captainId
    }))
  );
}

export function sanitizeCaptainRoles(selections: FantasySquadSelection[]) {
  let captainAssigned = false;
  let viceAssigned = false;
  let captainId: string | null = null;

  return selections.map((selection) => {
    const isCaptain = selection.isStarter && selection.isCaptain && !captainAssigned;
    if (isCaptain) {
      captainAssigned = true;
      captainId = selection.playerId;
    }

    const isViceCaptain = selection.isStarter && selection.isViceCaptain && selection.playerId !== captainId && !isCaptain && !viceAssigned;
    if (isViceCaptain) viceAssigned = true;

    return {
      ...selection,
      isCaptain,
      isViceCaptain
    };
  });
}

export function normalizeInitialSelections(selections: FantasySquadSelection[], players: FantasyPlannerPlayer[], rules: FantasySquadRules) {
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const sorted = selections
    .filter((selection) => playersById.has(selection.playerId))
    .sort((left, right) => left.slotIndex - right.slotIndex);
  const normalized: FantasySquadSelection[] = [];

  for (const selection of sorted) {
    const player = playersById.get(selection.playerId);
    const wantsStarter = selection.isStarter && player ? canStartFantasyPlayer(player, players, normalized, rules) : false;
    normalized.push({ ...selection, isStarter: wantsStarter, slotIndex: normalized.length });
  }

  const starterCount = () => normalized.filter((selection) => selection.isStarter).length;
  if (starterCount() < rules.starterSize) {
    const candidates = normalized
      .filter((selection) => !selection.isStarter)
      .map((selection) => playersById.get(selection.playerId))
      .filter((player): player is FantasyPlannerPlayer => Boolean(player))
      .sort((left, right) => playerHorizonPoints(right, 1) - playerHorizonPoints(left, 1));

    for (const player of candidates) {
      if (starterCount() >= rules.starterSize) break;
      if (!canStartFantasyPlayer(player, players, normalized, rules)) continue;
      const index = normalized.findIndex((selection) => selection.playerId === player.playerId);
      if (index >= 0) normalized[index] = { ...normalized[index], isStarter: true };
    }
  }

  return sanitizeCaptainRoles(orderSquadSelectionsWithBenchGoalkeeperLast(normalized, players));
}

export function fantasyPlayerAtRoundOffset(player: FantasyPlannerPlayer, roundOffset: number): FantasyPlannerPlayer {
  if (roundOffset <= 0) return player;
  return {
    ...player,
    predictedFp: player.roundPoints[roundOffset] ?? null,
    alternativePredictedFp: player.alternativeRoundPoints?.[roundOffset] ?? null,
    projectedFixtureComponents: null,
    projectionComponents: null,
    fplForecastBreakdown: null,
    projectionFormula: null,
    alternativeProjectedFixtureComponents: null,
    alternativeProjectionComponents: null,
    alternativeFplForecastBreakdown: null,
    alternativeProjectionFormula: null,
    expectedMinutes: null,
    startProbability: null,
    alternativeRoundPoints: player.alternativeRoundPoints?.slice(roundOffset),
    roundPoints: player.roundPoints.slice(roundOffset),
    roundFixtureCounts: player.roundFixtureCounts?.slice(roundOffset),
    fixtures: player.fixtures.slice(roundOffset),
    fixtureFullNames: player.fixtureFullNames?.slice(roundOffset),
    fixtureDifficulties: player.fixtureDifficulties.slice(roundOffset)
  };
}

export function cloneFantasyRoundPlans(plans: FantasySquadRoundPlan[]) {
  return plans.map((plan) => ({
    ...plan,
    selections: plan.selections.map((selection) => ({ ...selection }))
  }));
}

export function fantasyRoundPlansFingerprint(plans: FantasySquadRoundPlan[]) {
  return JSON.stringify(plans.map((plan) => ({
    roundOffset: plan.roundOffset,
    linkedToPrevious: plan.linkedToPrevious,
    selections: plan.selections.map((selection) => [
      selection.playerId,
      selection.isStarter,
      selection.isCaptain,
      selection.isViceCaptain,
      selection.slotIndex
    ])
  })));
}

export function normalizePlannerRoundPlans(
  plans: FantasySquadRoundPlan[] | undefined,
  fallbackSelections: FantasySquadSelection[],
  players: FantasyPlannerPlayer[],
  rules: FantasySquadRules
) {
  const source = plans?.length === 5 ? plans : createFantasySquadRoundPlans(fallbackSelections);
  return source.map((plan, roundOffset) => ({
    roundOffset,
    linkedToPrevious: roundOffset > 0 && plan.linkedToPrevious,
    selections: normalizeInitialSelections(plan.selections, players, rules)
  }));
}

export function promoteStarter(
  player: FantasyPlannerPlayer,
  players: FantasyPlannerPlayer[],
  selections: FantasySquadSelection[],
  rules: FantasySquadRules,
  horizon: number
) {
  const direct = selections.map((selection) =>
    selection.playerId === player.playerId ? { ...selection, isStarter: true } : selection
  );
  if (summarizeFantasySquad(players, direct, rules, horizon).violations.length === 0) return direct;

  const playersById = new Map(players.map((item) => [item.playerId, item]));
  const demotionCandidates = selections
    .filter((selection) => selection.isStarter && !selection.isLocked && selection.playerId !== player.playerId)
    .map((selection) => playersById.get(selection.playerId))
    .filter((candidate): candidate is FantasyPlannerPlayer => Boolean(candidate))
    .filter((candidate) => (player.positionGroup === "GK" ? candidate.positionGroup === "GK" : candidate.positionGroup !== "GK"))
    .sort((left, right) => playerHorizonPoints(left, horizon) - playerHorizonPoints(right, horizon));

  for (const candidate of demotionCandidates) {
    const swapped = selections.map((selection) =>
      selection.playerId === player.playerId
        ? { ...selection, isStarter: true }
        : selection.playerId === candidate.playerId
          ? { ...selection, isStarter: false }
          : selection
    );
    if (summarizeFantasySquad(players, swapped, rules, horizon).violations.length === 0) return swapped;
  }

  return null;
}
