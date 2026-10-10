
import { type PlannerFixture, inversePoissonOver15Probability, numericOrNull, clamp } from "./squad-team-strength";
/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { calculateCustomFormulaScore } from "@/lib/scoring/formula";
import { type ProjectionFormulaConfig } from "./projection-formula-config";
import { ProjectionInputError, projectTeamPlayers, type PlayerFixtureProjection, type ProbableParticipantInput, type ProjectedTeamTotals } from "./deterministic_fantasy_projection";
import { archivedExpectedMinutes, blendArchivedEventRate, positionEventPriorPer90 } from "./player-season-prior";
import { type SharedMachetePlayerRow } from "./shared_read_model";
import { normalizeFantasyPosition, type FantasyProjectionFixtureInputs, type FantasyRoundProjection } from "./squad_logic";

export function buildFixtureComponentInputs(
  projection: PlayerFixtureProjection | null,
  formulaMetrics?: Record<string, unknown>
): FantasyProjectionFixtureInputs | null {
  if (!projection) return null;

  return {
    expectedMinutes: projection.expectedMinutes ?? null,
    baseExpectedMinutes: numericProjectionMetric(formulaMetrics?.base_expected_minutes),
    rosterStarter: numericProjectionMetric(formulaMetrics?.roster_starter) === null
      ? null
      : numericProjectionMetric(formulaMetrics?.roster_starter) === 1,
    rosterStarterMinuteFloor: numericProjectionMetric(formulaMetrics?.roster_starter_minute_floor),
    rosterStarterMinutesUplift: numericProjectionMetric(formulaMetrics?.roster_starter_minutes_uplift),
    eventExposureMinutes: numericProjectionMetric(formulaMetrics?.event_exposure_minutes),
    per90SampleMinutes: numericProjectionMetric(formulaMetrics?.per90_sample_minutes),
    per90SampleReliability: numericProjectionMetric(formulaMetrics?.per90_sample_reliability),
    starterRoleReliability: numericProjectionMetric(formulaMetrics?.starter_role_reliability),
    starterBaseMinuteReliability: numericProjectionMetric(formulaMetrics?.starter_base_minute_reliability),
    historicalStartProbability: numericProjectionMetric(formulaMetrics?.historical_start_probability),
    per90UpliftReliability: numericProjectionMetric(formulaMetrics?.per90_uplift_reliability),
    preRoleXgRatePer90: numericProjectionMetric(formulaMetrics?.pre_role_xg_per_90),
    preRoleXaRatePer90: numericProjectionMetric(formulaMetrics?.pre_role_xa_per_90),
    positionXgPriorPer90: numericProjectionMetric(formulaMetrics?.starter_role_position_xg_prior_per_90),
    positionXaPriorPer90: numericProjectionMetric(formulaMetrics?.starter_role_position_xa_prior_per_90),
    roleAdjustedXgRatePer90: numericProjectionMetric(formulaMetrics?.blended_xg_per_90),
    roleAdjustedXaRatePer90: numericProjectionMetric(formulaMetrics?.blended_xa_per_90),
    transferRatePenalty: numericProjectionMetric(formulaMetrics?.transfer_rate_penalty),
    sparseTeamAttackAllocationGuard: numericProjectionMetric(formulaMetrics?.sparse_team_attack_allocation_guard) === 1,
    teamAttackAllocationCandidates: numericProjectionMetric(formulaMetrics?.team_attack_allocation_candidates),
    teamAttackMeaningfulPlayers: numericProjectionMetric(formulaMetrics?.team_attack_meaningful_players),
    teamAttackEventExposureMinutes: numericProjectionMetric(formulaMetrics?.team_attack_event_exposure_minutes),
    teamAttackMinuteCoverage: numericProjectionMetric(formulaMetrics?.team_attack_minute_coverage),
    teamAttackGoalReferenceWeight: numericProjectionMetric(formulaMetrics?.team_attack_goal_reference_weight),
    teamAttackAssistReferenceWeight: numericProjectionMetric(formulaMetrics?.team_attack_assist_reference_weight),
    teamAttackGoalReserveWeight: numericProjectionMetric(formulaMetrics?.team_attack_goal_reserve_weight),
    teamAttackAssistReserveWeight: numericProjectionMetric(formulaMetrics?.team_attack_assist_reserve_weight),
    minuteHistorySource: minuteHistorySourceMetric(formulaMetrics?.minute_history_source),
    currentClubHistoryMatches: numericProjectionMetric(formulaMetrics?.current_club_history_matches),
    previousClubHistoryMatches: numericProjectionMetric(formulaMetrics?.previous_club_history_matches),
    previousClubHistoryTeam: stringProjectionMetric(formulaMetrics?.previous_club_history_team),
    previousClubPenaltyFactor: numericProjectionMetric(formulaMetrics?.previous_club_penalty_factor),
    appearanceProbability: projection.probabilities?.appearance ?? null,
    sixtyMinutesProbability: projection.probabilities?.sixtyMinutes ?? null,
    fullMatchProbability: projection.probabilities?.fullMatch ?? null,
    expectedGoals: projection.expectedEvents?.goals ?? null,
    expectedAssists: projection.expectedEvents?.assists ?? null,
    expectedRecoveries: projection.expectedEvents?.recoveries ?? null,
    expectedSaves: projection.expectedEvents?.saves ?? null,
    expectedYellowCards: projection.expectedEvents?.yellowCards ?? null,
    expectedRedCards: projection.expectedEvents?.redCards ?? null,
    expectedGoalsConceded: projection.expectedEvents?.goalsConceded ?? null,
    expectedCleanSheets: projection.expectedEvents?.cleanSheets ?? null
  };
}

export function numericProjectionMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringProjectionMetric(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function minuteHistorySourceMetric(value: unknown): FantasyProjectionFixtureInputs["minuteHistorySource"] {
  return value === "NONE" || value === "CURRENT_CLUB" || value === "PREVIOUS_CLUB_FALLBACK" || value === "MIXED"
    ? value
    : null;
}

export type PlannerRoundFixtures = {
  rounds: FantasyRoundProjection[];
  fixturesByTeamRound: Map<string, Map<string, PlannerFixture[]>>;
  teamShortNameById: Map<string, string>;
  teamFullNameById?: Map<string, string>;
};

export type ComponentProjectionIndex = {
  byFixturePlayer: Map<string, PlayerFixtureProjection>;
  formulaMetricsByFixturePlayer: Map<string, Record<string, unknown>>;
  errorsByFixtureTeam: Map<string, string>;
};

export type ComponentProjectionMode = "PRIMARY" | "FRIEND_ALT";

export function buildComponentProjectionIndex(
  rows: Array<SharedMachetePlayerRow & { teamId: string; playerId: string }>,
  roundsAndFixtures: PlannerRoundFixtures,
  sportsPositionsByPlayerId: Map<string, string>,
  mode: ComponentProjectionMode = "PRIMARY"
): ComponentProjectionIndex {
  const byFixturePlayer = new Map<string, PlayerFixtureProjection>();
  const formulaMetricsByFixturePlayer = new Map<string, Record<string, unknown>>();
  const errorsByFixtureTeam = new Map<string, string>();
  const rowsByTeam = new Map<string, Array<SharedMachetePlayerRow & { teamId: string; playerId: string }>>();
  for (const row of rows) {
    const teamRows = rowsByTeam.get(row.teamId) ?? [];
    teamRows.push(row);
    rowsByTeam.set(row.teamId, teamRows);
  }

  const uniqueFixtures = new Map<string, PlannerFixture>();
  for (const fixturesByTeam of roundsAndFixtures.fixturesByTeamRound.values()) {
    for (const fixtures of fixturesByTeam.values()) {
      for (const fixture of fixtures) uniqueFixtures.set(fixtureTeamProjectionKey(fixture.id, fixture.teamId), fixture);
    }
  }

  for (const [fixtureTeamKey, fixture] of uniqueFixtures) {
    const teamRows = rowsByTeam.get(fixture.teamId) ?? [];
    const projectionRows = mode === "FRIEND_ALT" ? friendStartingRows(teamRows) : teamRows;
    const participants = projectionRows
      .map((row) => componentParticipant(row, sportsPositionsByPlayerId.get(row.playerId), mode))
      .filter((row): row is ProbableParticipantInput => row !== null);
    const team = componentTeamTotals(fixture, participants, mode);
    if (!team) {
      errorsByFixtureTeam.set(fixtureTeamKey, "team xG/xGA is missing");
      continue;
    }

    try {
      const projection = projectTeamPlayers(team, participants);
      for (const player of projection.players) {
        byFixturePlayer.set(fixturePlayerProjectionKey(fixture.id, player.playerId), player);
      }
    } catch (error) {
      const message = error instanceof ProjectionInputError
        ? error.issues.slice(0, 2).map((issue) => `${issue.path} ${issue.message}`).join("; ")
        : error instanceof Error ? error.message : "unknown projection error";
      errorsByFixtureTeam.set(fixtureTeamKey, message);
    }
  }

  return { byFixturePlayer, formulaMetricsByFixturePlayer, errorsByFixtureTeam };
}

export type PipelineParticipant = {
  row: SharedMachetePlayerRow & { teamId: string; playerId: string };
  input: ProbableParticipantInput;
  metrics: Record<string, unknown>;
};

export const starterPer90FullReliabilityMinutes = 450;

export const starterPer90MinimumReliability = 0.25;

export const completeTeamPlayerMinutes = 11 * 90;

export const minimumSparseGuardRosterSize = 11;

export const minimumMeaningfulAllocationPlayers = 7;

export const meaningfulAllocationMinutes = 15;

export const minimumTeamAllocationEventMinutes = 360;

export const teamAttackAllocationReservePlayerId = "__team_attack_allocation_reserve__";

export const standardAttackAllocationPositions = [
  "GK",
  "DEF", "DEF", "DEF", "DEF",
  "MID", "MID", "MID", "MID",
  "FWD", "FWD"
] as const;

export function buildFormulaProjectionIndex(
  rows: Array<SharedMachetePlayerRow & { teamId: string; playerId: string }>,
  roundsAndFixtures: PlannerRoundFixtures,
  sportsPositionsByPlayerId: Map<string, string>,
  config: ProjectionFormulaConfig,
  probableXiOnly = false,
  scoringScope: "GENERIC" | "FPL" = "GENERIC"
): ComponentProjectionIndex {
  const byFixturePlayer = new Map<string, PlayerFixtureProjection>();
  const formulaMetricsByFixturePlayer = new Map<string, Record<string, unknown>>();
  const errorsByFixtureTeam = new Map<string, string>();
  const rowsByTeam = new Map<string, Array<SharedMachetePlayerRow & { teamId: string; playerId: string }>>();
  for (const row of rows) {
    const teamRows = rowsByTeam.get(row.teamId) ?? [];
    teamRows.push(row);
    rowsByTeam.set(row.teamId, teamRows);
  }

  const uniqueFixtures = new Map<string, PlannerFixture>();
  for (const fixturesByTeam of roundsAndFixtures.fixturesByTeamRound.values()) {
    for (const fixtures of fixturesByTeam.values()) {
      for (const fixture of fixtures) uniqueFixtures.set(fixtureTeamProjectionKey(fixture.id, fixture.teamId), fixture);
    }
  }
  const nearestFixtureIdByTeam = nearestFixtureIdsByTeam(uniqueFixtures.values());

  for (const [fixtureTeamKey, fixture] of uniqueFixtures) {
    try {
      const starterFloorApplies = nearestFixtureIdByTeam.get(fixture.teamId) === fixture.id;
      const rankedCandidates = rankPipelineCandidates(
        (rowsByTeam.get(fixture.teamId) ?? [])
          .map((row) => pipelineParticipant(row, sportsPositionsByPlayerId.get(row.playerId), config, starterFloorApplies, scoringScope))
          .filter((entry): entry is PipelineParticipant => entry !== null)
      );
      const historyCandidates = probableXiOnly
        ? starterFloorApplies
          ? rankedCandidates.slice(0, 11)
          : rankedCandidates
        : rankedCandidates;
      const teamContext = pipelineTeamContext(fixture, config);
      const candidates = applySparseHistoryAllocationFallbacks(
        historyCandidates.map((entry) => pipelineAllocationParticipant(entry, teamContext, config, scoringScope)),
        teamContext
      );
      const guardedAllocation = applySparseTeamAttackAllocationGuard(candidates, teamContext);
      const participants = guardedAllocation.participants;
      const team = pipelineTeamTotals(fixture, participants, teamContext);
      const projection = projectTeamPlayers(team, participants);

      for (const player of projection.players) {
        if (player.playerId === teamAttackAllocationReservePlayerId) continue;
        const key = fixturePlayerProjectionKey(fixture.id, player.playerId);
        const candidate = candidates.find((entry) => entry.input.playerId === player.playerId);
        byFixturePlayer.set(key, player);
        formulaMetricsByFixturePlayer.set(key, {
          ...(candidate?.metrics ?? {}),
          ...teamContext,
          ...guardedAllocation.metrics,
          goal_allocation_weight: player.allocationWeights.goals,
          assist_allocation_weight: player.allocationWeights.assists,
          recovery_allocation_weight: player.allocationWeights.recoveries,
          save_allocation_weight: player.allocationWeights.saves
        });
      }
    } catch (error) {
      const message = error instanceof ProjectionInputError
        ? error.issues.slice(0, 3).map((issue) => `${issue.path} ${issue.message}`).join("; ")
        : error instanceof Error ? error.message : "unknown formula projection error";
      errorsByFixtureTeam.set(fixtureTeamKey, message);
    }
  }

  return { byFixturePlayer, formulaMetricsByFixturePlayer, errorsByFixtureTeam };
}

export function rankPipelineCandidates(candidates: PipelineParticipant[]) {
  return candidates.sort((left, right) =>
    Number(right.metrics.roster_starter_marked) - Number(left.metrics.roster_starter_marked) ||
    right.input.probabilities.appearance! - left.input.probabilities.appearance! ||
    right.input.expectedMinutes! - left.input.expectedMinutes! ||
    right.row.minutesPlayed - left.row.minutesPlayed
  );
}

export function pipelineParticipant(
  row: SharedMachetePlayerRow & { teamId: string; playerId: string },
  sportsPosition: string | undefined,
  config: ProjectionFormulaConfig,
  starterFloorApplies: boolean,
  scoringScope: "GENERIC" | "FPL"
): PipelineParticipant | null {
  const position = normalizeFantasyPosition(fantasyPlannerPosition(sportsPosition ?? null, null, row.position));
  if (position === "UNK") return null;
  const rosterStarterApplies = row.isStarter && starterFloorApplies;
  const metrics: Record<string, unknown> = {
    ...(row.rawMetrics ?? {}),
    roster_starter: 0,
    roster_starter_marked: row.isStarter ? 1 : 0,
    roster_starter_floor_applies: rosterStarterApplies ? 1 : 0,
    minute_history_source: row.minuteHistoryProvenance?.source ?? "NONE",
    current_club_history_matches: row.minuteHistoryProvenance?.currentClubMatches ?? 0,
    previous_club_history_matches: row.minuteHistoryProvenance?.previousClubMatches ?? 0,
    previous_club_history_team: row.minuteHistoryProvenance?.previousClubName ?? "",
    previous_club_penalty_factor: row.minuteHistoryProvenance?.previousClubPenaltyFactor ?? 1
  };
  // The manually marked club XI is a one-fixture availability signal, not a
  // permanent history input. Evaluate the user's formula without the flag,
  // then apply the position-specific floor only to the nearest fixture.
  const formulaExpectedMinutes = clamp(formulaValue(config.history.expectedMinutes, metrics), 0, 90);
  const baseExpectedMinutes = archivedExpectedMinutes({
    existingMinutes: formulaExpectedMinutes,
    priorAppearances: numericOrNull(metrics.archive_prior_appearances) ?? 0,
    priorMinutes: numericOrNull(metrics.archive_prior_minutes),
    priorTeamMatches: numericOrNull(metrics.archive_prior_team_matches) ?? 0,
    currentTeamStatMatches: numericOrNull(metrics.current_team_stat_matches) ?? 0,
    detailedClubHistoryMatches:
      (numericOrNull(metrics.current_club_history_matches) ?? 0) +
      (numericOrNull(metrics.previous_club_history_matches) ?? 0),
    sameTeam: numericOrNull(metrics.archive_prior_same_team) === 1
  });
  metrics.roster_starter = rosterStarterApplies ? 1 : 0;
  const starterMinuteFloor = position === "GK" ? 90 : 60;
  const expectedMinutes = rosterStarterApplies ? Math.max(baseExpectedMinutes, starterMinuteFloor) : baseExpectedMinutes;
  const historyMinutes = Math.max(0, numericOrNull(metrics.minutes_365) ?? row.minutesPlayed ?? 0);
  // A manual XI mark is strong evidence of availability, but it does not turn a
  // short or substitute-heavy historical sample into a reliable starter per-90
  // event rate. Appearance thresholds use the full starter floor; event-rate
  // uplift is capped by both sample size and the player's historical role.
  const historicalStartProbability = clamp(row.startProbability ?? 0, 0, 1);
  const baseMinuteRoleReliability = starterMinuteFloor > 0
    ? clamp(baseExpectedMinutes / starterMinuteFloor, 0, 1)
    : 1;
  const sampleReliability = rosterStarterApplies
    ? clamp(historyMinutes / starterPer90FullReliabilityMinutes, starterPer90MinimumReliability, 1)
    : 1;
  const roleReliability = rosterStarterApplies
    ? clamp(
      Math.max(historicalStartProbability, baseMinuteRoleReliability),
      starterPer90MinimumReliability,
      1
    )
    : 1;
  const per90UpliftReliability = rosterStarterApplies
    ? Math.min(sampleReliability, roleReliability)
    : 1;
  const eventExposureMinutes = rosterStarterApplies
    ? baseExpectedMinutes + (expectedMinutes - baseExpectedMinutes) * per90UpliftReliability
    : expectedMinutes;
  const transferRatePenalty = blendedTransferRatePenalty(row.minuteHistoryProvenance);
  metrics.base_expected_minutes = baseExpectedMinutes;
  metrics.roster_starter_minute_floor = rosterStarterApplies ? starterMinuteFloor : 0;
  metrics.roster_starter_minutes_uplift = expectedMinutes - baseExpectedMinutes;
  metrics.expected_minutes = expectedMinutes;
  metrics.per90_sample_minutes = historyMinutes;
  metrics.per90_sample_reliability = sampleReliability;
  metrics.historical_start_probability = historicalStartProbability;
  metrics.starter_base_minute_reliability = baseMinuteRoleReliability;
  metrics.starter_role_reliability = roleReliability;
  metrics.per90_uplift_reliability = per90UpliftReliability;
  metrics.event_exposure_minutes = eventExposureMinutes;
  metrics.transfer_rate_penalty = transferRatePenalty;
  const countsAsFullMatch = countsAsFullFantasyMatch(expectedMinutes);
  const appearance = countsAsFullMatch ? 1 : clamp(formulaValue(config.history.appearanceProbability, metrics), 0, 1);
  metrics.appearance_probability = appearance;
  const sixtyMinutes = countsAsFullMatch ? 1 : clamp(formulaValue(config.history.sixtyProbability, metrics), 0, appearance);
  metrics.sixty_minute_probability = sixtyMinutes;
  metrics["60_minute_probability"] = sixtyMinutes;
  const fullMatch = countsAsFullMatch ? 1 : clamp(formulaValue(config.history.fullMatchProbability, metrics), 0, sixtyMinutes);
  metrics.full_match_probability = fullMatch;
  const formulaXg = nonNegativeFormulaValue(config.history.xgRate, metrics, "history.xgRate");
  const formulaXa = nonNegativeFormulaValue(config.history.xaRate, metrics, "history.xaRate");
  const currentSeasonMinutes = numericOrNull(metrics.current_season_minutes) ?? 0;
  const currentSeasonXg = numericOrNull(metrics.current_season_xg) ?? 0;
  const currentSeasonXa = numericOrNull(metrics.current_season_xa) ?? 0;
  const goalBlend = blendArchivedEventRate({
    position,
    event: "goals",
    currentRatePer90: currentSeasonMinutes > 0 ? currentSeasonXg * 90 / currentSeasonMinutes : formulaXg,
    currentMinutes: currentSeasonMinutes,
    currentEvents: currentSeasonXg,
    priorAppearances: numericOrNull(metrics.archive_prior_appearances) ?? 0,
    priorMinutes: numericOrNull(metrics.archive_prior_minutes),
    priorEvents: numericOrNull(metrics.archive_prior_goals),
    tierFactor: numericOrNull(metrics.archive_tier_factor) ?? 1
  });
  const assistBlend = blendArchivedEventRate({
    position,
    event: "assists",
    currentRatePer90: currentSeasonMinutes > 0 ? currentSeasonXa * 90 / currentSeasonMinutes : formulaXa,
    currentMinutes: currentSeasonMinutes,
    currentEvents: currentSeasonXa,
    priorAppearances: numericOrNull(metrics.archive_prior_appearances) ?? 0,
    priorMinutes: numericOrNull(metrics.archive_prior_minutes),
    priorEvents: numericOrNull(metrics.archive_prior_assists),
    tierFactor: numericOrNull(metrics.archive_tier_factor) ?? 1
  });
  const preRoleXg = goalBlend?.ratePer90 ?? formulaXg * transferRatePenalty;
  const preRoleXa = assistBlend?.ratePer90 ?? formulaXa * transferRatePenalty;
  const positionXgPrior = positionEventPriorPer90(position, "goals");
  const positionXaPrior = positionEventPriorPer90(position, "assists");
  const xg = rosterStarterApplies
    ? blendStarterRoleRate(preRoleXg, positionXgPrior, roleReliability)
    : preRoleXg;
  const xa = rosterStarterApplies
    ? blendStarterRoleRate(preRoleXa, positionXaPrior, roleReliability)
    : preRoleXa;
  const recoveries = scoringScope === "FPL"
    ? 0
    : nonNegativeFormulaValue(config.history.recoveryRate, metrics, "history.recoveryRate") * transferRatePenalty;
  const saves = nonNegativeFormulaValue(config.history.saveRate, metrics, "history.saveRate") * transferRatePenalty;
  const yellowCards = nonNegativeFormulaValue(config.history.yellowRate, metrics, "history.yellowRate") * transferRatePenalty;
  const redCards = nonNegativeFormulaValue(config.history.redRate, metrics, "history.redRate") * transferRatePenalty;
  Object.assign(metrics, {
    pre_role_xg_per_90: preRoleXg,
    pre_role_xa_per_90: preRoleXa,
    starter_role_position_xg_prior_per_90: positionXgPrior,
    starter_role_position_xa_prior_per_90: positionXaPrior,
    blended_xg_per_90: xg,
    blended_xa_per_90: xa,
    blended_recoveries_per_90: recoveries,
    blended_saves_per_90: saves,
    blended_yellow_cards_per_90: yellowCards,
    blended_red_cards_per_90: redCards
  });
  if (goalBlend) {
    Object.assign(metrics, {
      archive_goal_blend_fade: goalBlend.fade,
      archive_goal_effective_appearances: goalBlend.effectivePriorAppearances,
      archive_goal_position_prior_appearances: goalBlend.positionPriorAppearances,
      archive_blended_xg_per_90: goalBlend.ratePer90
    });
  }
  if (assistBlend) {
    Object.assign(metrics, {
      archive_assist_blend_fade: assistBlend.fade,
      archive_assist_effective_appearances: assistBlend.effectivePriorAppearances,
      archive_assist_position_prior_appearances: assistBlend.positionPriorAppearances,
      archive_blended_xa_per_90: assistBlend.ratePer90
    });
  }

  return {
    row,
    metrics,
    input: {
      playerId: row.playerId,
      position,
      expectedMinutes,
      probabilities: { appearance, sixtyMinutes, fullMatch },
      ratesPer90: { xg, xa, recoveries, saves, yellowCards, redCards }
    }
  };
}

export function blendStarterRoleRate(observedRate: number, positionPrior: number, roleReliability: number) {
  const reliability = clamp(roleReliability, 0, 1);
  return positionPrior + (Math.max(0, observedRate) - positionPrior) * reliability;
}

export function blendedTransferRatePenalty(provenance: SharedMachetePlayerRow["minuteHistoryProvenance"]) {
  const previousMatches = provenance?.previousClubMatches ?? 0;
  if (previousMatches <= 0) return 1;
  const currentMatches = provenance?.currentClubMatches ?? 0;
  const previousPenalty = clamp(provenance?.previousClubPenaltyFactor ?? 1, 0, 1);
  return (currentMatches + previousMatches * previousPenalty) / Math.max(1, currentMatches + previousMatches);
}

export function nearestFixtureIdsByTeam(fixtures: Iterable<PlannerFixture>) {
  const nearest = new Map<string, PlannerFixture>();
  for (const fixture of fixtures) {
    const current = nearest.get(fixture.teamId);
    if (!current || comparePlannerFixtures(fixture, current) < 0) nearest.set(fixture.teamId, fixture);
  }
  return new Map([...nearest].map(([teamId, fixture]) => [teamId, fixture.id]));
}

export function comparePlannerFixtures(left: PlannerFixture, right: PlannerFixture) {
  const leftKickoff = left.kickoffAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightKickoff = right.kickoffAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftKickoff - rightKickoff || left.id.localeCompare(right.id);
}

export function countsAsFullFantasyMatch(expectedMinutes: number) {
  return Number.isFinite(expectedMinutes) && expectedMinutes >= 80;
}

export function pipelineAllocationParticipant(
  participant: PipelineParticipant,
  teamContext: Record<string, unknown>,
  config: ProjectionFormulaConfig,
  scoringScope: "GENERIC" | "FPL"
): PipelineParticipant {
  const metrics = { ...participant.metrics, ...teamContext };
  const position = participant.input.position;
  const allocationWeights = {
    goals: per90AwareAllocationValue(config.allocation.goals, metrics, "allocation.goals"),
    assists: per90AwareAllocationValue(config.allocation.assists, metrics, "allocation.assists"),
    recoveries: position === "GK" || scoringScope === "FPL"
      ? 0
      : per90AwareAllocationValue(config.allocation.recoveries, metrics, "allocation.recoveries"),
    saves: position === "GK" ? per90AwareAllocationValue(config.allocation.saves, metrics, "allocation.saves") : 0
  };
  const minutesExposure = (numericOrNull(metrics.expected_minutes) ?? 0) / 90;
  const eventExposure = Math.min(
    minutesExposure,
    (numericOrNull(metrics.event_exposure_minutes) ?? numericOrNull(metrics.expected_minutes) ?? 0) / 90
  );
  const cardExposureFactor = Math.min(
    nonNegativeFormulaValue(config.allocation.cardExposure, metrics, "allocation.cardExposure"),
    eventExposure
  );
  Object.assign(metrics, {
    goal_allocation_weight: allocationWeights.goals,
    assist_allocation_weight: allocationWeights.assists,
    recovery_allocation_weight: allocationWeights.recoveries,
    save_allocation_weight: allocationWeights.saves,
    card_exposure_factor: cardExposureFactor
  });
  return {
    ...participant,
    metrics,
    input: { ...participant.input, allocationWeights, cardExposureFactor }
  };
}

export function applySparseHistoryAllocationFallbacks(
  participants: PipelineParticipant[],
  teamContext: Record<string, unknown>
) {
  if (participants.length === 0) return participants;
  const expectedGoals = numericOrNull(teamContext.expected_goals) ?? 0;
  const expectedAssists = expectedGoals * (numericOrNull(teamContext.assists_per_goal) ?? 0);
  let result = participants;
  if (expectedGoals > 0 && allocationWeightTotal(result, "goals") <= 0) {
    result = applyPositionAllocationFallback(result, "goals");
  }
  if (expectedAssists > 0 && allocationWeightTotal(result, "assists") <= 0) {
    result = applyPositionAllocationFallback(result, "assists");
  }
  return result;
}

export function applySparseTeamAttackAllocationGuard(
  candidates: PipelineParticipant[],
  teamContext: Record<string, unknown>
) {
  const eventExposureMinutes = candidates.map((candidate) => Math.min(
    candidate.input.expectedMinutes ?? 0,
    numericOrNull(candidate.metrics.event_exposure_minutes) ?? candidate.input.expectedMinutes ?? 0
  ));
  const totalEventExposureMinutes = eventExposureMinutes.reduce((total, minutes) => total + minutes, 0);
  const meaningfulPlayers = eventExposureMinutes.filter((minutes) => minutes >= meaningfulAllocationMinutes).length;
  const expectedGoals = numericOrNull(teamContext.expected_goals) ?? 0;
  const expectedAssists = expectedGoals * (numericOrNull(teamContext.assists_per_goal) ?? 0);
  const sparseGuardApplies = candidates.length >= minimumSparseGuardRosterSize &&
    (expectedGoals > 0 || expectedAssists > 0) &&
    (meaningfulPlayers < minimumMeaningfulAllocationPlayers || totalEventExposureMinutes < minimumTeamAllocationEventMinutes);
  const referenceGoalWeight = standardAttackAllocationPositions.reduce(
    (total, position) => total + positionEventPriorPer90(position, "goals"),
    0
  );
  const referenceAssistWeight = standardAttackAllocationPositions.reduce(
    (total, position) => total + positionEventPriorPer90(position, "assists"),
    0
  );
  const positionGoalCoverage = candidates.reduce((total, candidate, index) =>
    total + positionEventPriorPer90(candidate.input.position, "goals") * eventExposureMinutes[index] / 90,
  0);
  const positionAssistCoverage = candidates.reduce((total, candidate, index) =>
    total + positionEventPriorPer90(candidate.input.position, "assists") * eventExposureMinutes[index] / 90,
  0);
  const minuteCoverage = clamp(totalEventExposureMinutes / completeTeamPlayerMinutes, 0, 1);
  const goalReserveWeight = sparseGuardApplies
    ? Math.max(0, referenceGoalWeight - positionGoalCoverage, referenceGoalWeight * (1 - minuteCoverage))
    : 0;
  const assistReserveWeight = sparseGuardApplies
    ? Math.max(0, referenceAssistWeight - positionAssistCoverage, referenceAssistWeight * (1 - minuteCoverage))
    : 0;
  const metrics: Record<string, unknown> = {
    sparse_team_attack_allocation_guard: sparseGuardApplies ? 1 : 0,
    team_attack_allocation_candidates: candidates.length,
    team_attack_meaningful_players: meaningfulPlayers,
    team_attack_event_exposure_minutes: totalEventExposureMinutes,
    team_attack_minute_coverage: minuteCoverage,
    team_attack_goal_reference_weight: referenceGoalWeight,
    team_attack_assist_reference_weight: referenceAssistWeight,
    team_attack_goal_reserve_weight: goalReserveWeight,
    team_attack_assist_reserve_weight: assistReserveWeight
  };

  if (goalReserveWeight <= 0 && assistReserveWeight <= 0) {
    return { participants: candidates.map((candidate) => candidate.input), metrics };
  }

  const reserve: ProbableParticipantInput = {
    playerId: teamAttackAllocationReservePlayerId,
    position: "FWD",
    expectedMinutes: 0,
    probabilities: { appearance: 0, sixtyMinutes: 0, fullMatch: 0 },
    ratesPer90: { xg: 0, xa: 0, recoveries: 0, saves: 0, yellowCards: 0, redCards: 0 },
    allocationWeights: {
      goals: goalReserveWeight,
      assists: assistReserveWeight,
      recoveries: 0,
      saves: 0
    },
    cardExposureFactor: 0
  };
  return { participants: [...candidates.map((candidate) => candidate.input), reserve], metrics };
}

export function allocationWeightTotal(
  participants: PipelineParticipant[],
  metric: "goals" | "assists"
) {
  return participants.reduce(
    (total, participant) => total + (participant.input.allocationWeights?.[metric] ?? 0),
    0
  );
}

export function applyPositionAllocationFallback(
  participants: PipelineParticipant[],
  metric: "goals" | "assists"
) {
  return participants.map((participant) => {
    const expectedMinutes = participant.input.expectedMinutes ?? 0;
    const eventExposureMinutes = Math.min(
      expectedMinutes,
      numericOrNull(participant.metrics.event_exposure_minutes) ?? expectedMinutes
    );
    const weight = positionEventPriorPer90(participant.input.position, metric) * eventExposureMinutes / 90;
    return {
      ...participant,
      metrics: {
        ...participant.metrics,
        [`${metric === "goals" ? "goal" : "assist"}_allocation_sparse_history_fallback`]: weight > 0 ? 1 : 0,
        [`${metric === "goals" ? "goal" : "assist"}_allocation_weight`]: weight
      },
      input: {
        ...participant.input,
        allocationWeights: {
          ...participant.input.allocationWeights,
          [metric]: weight
        }
      }
    };
  });
}

export function pipelineTeamContext(
  fixture: PlannerFixture,
  config: ProjectionFormulaConfig
) {
  if (fixture.projectedXg === null || fixture.projectedXga === null) {
    throw new Error("team xG/xGA is missing");
  }
  const bookmakerImpliedXg = inversePoissonOver15Probability(fixture.teamOver15Probability);
  const bookmakerAvailable = bookmakerImpliedXg !== null && fixture.cleanSheetProbability !== null && fixture.cleanSheetProbability !== undefined;
  const metrics: Record<string, unknown> = {
    projected_xg: fixture.projectedXg,
    projected_xga: fixture.projectedXga,
    fotmob_team_xg: fixture.projectedXg,
    fotmob_team_xga: fixture.projectedXga,
    bookmaker_implied_xg: bookmakerImpliedXg ?? 0,
    bookmaker_odds_available: bookmakerAvailable ? 1 : 0,
    fixture_clean_sheet_probability: fixture.cleanSheetProbability ?? 0,
    fixture_team_over_1_5_probability: fixture.teamOver15Probability ?? 0,
    fixture_attack_multiplier: fixture.attackMultiplier ?? 1,
    fixture_defense_multiplier: fixture.defenseMultiplier ?? 1,
    is_home: fixture.side === "H" ? 1 : 0,
    is_away: fixture.side === "A" ? 1 : 0
  };
  metrics.expected_goals = nonNegativeFormulaValue(config.team.expectedGoals, metrics, "team.expectedGoals");
  metrics.expected_goals_against = nonNegativeFormulaValue(config.team.expectedGoalsAgainst, metrics, "team.expectedGoalsAgainst");
  metrics.assists_per_goal = nonNegativeFormulaValue(config.team.assistsPerGoal, metrics, "team.assistsPerGoal");
  metrics.clean_sheet_probability = clamp(formulaValue(config.team.cleanSheetProbability, metrics), 0, 1);
  return metrics;
}

export function pipelineTeamTotals(
  fixture: PlannerFixture,
  participants: ProbableParticipantInput[],
  metrics: Record<string, unknown>
): ProjectedTeamTotals {
  const expectedGoals = numericOrNull(metrics.expected_goals) ?? 0;
  return {
    teamId: fixture.teamId,
    expectedGoals,
    expectedGoalsAgainst: numericOrNull(metrics.expected_goals_against) ?? 0,
    expectedAssists: expectedGoals * (numericOrNull(metrics.assists_per_goal) ?? 0),
    expectedRecoveries: participants.reduce((total, player) => total + (player.allocationWeights?.recoveries ?? 0), 0),
    expectedSaves: participants.reduce((total, player) => total + (player.allocationWeights?.saves ?? 0), 0),
    cleanSheetProbability: numericOrNull(metrics.clean_sheet_probability) ?? 0
  };
}

export function formulaValue(formula: string, metrics: Record<string, unknown>) {
  return calculateCustomFormulaScore(formula, metrics);
}

export function nonNegativeFormulaValue(formula: string, metrics: Record<string, unknown>, path: string) {
  const value = formulaValue(formula, metrics);
  if (value < 0) throw new Error(`${path} must return a non-negative number, received ${value}`);
  return value;
}

export function per90AwareAllocationValue(formula: string, metrics: Record<string, unknown>, path: string) {
  const value = nonNegativeFormulaValue(formula, metrics, path);
  const usesPer90 = /\{[^}]*per 90[^}]*\}/i.test(formula);
  const alreadyUsesExpectedMinutes = /\{Expected minutes\}/i.test(formula);
  if (!usesPer90) return value;
  const expectedMinutes = numericOrNull(metrics.expected_minutes) ?? 0;
  const eventExposureMinutes = Math.min(
    expectedMinutes,
    numericOrNull(metrics.event_exposure_minutes) ?? expectedMinutes
  );
  if (!alreadyUsesExpectedMinutes) return value * (eventExposureMinutes / 90);
  return expectedMinutes > 0 ? value * (eventExposureMinutes / expectedMinutes) : 0;
}

export function componentParticipant(
  row: SharedMachetePlayerRow & { teamId: string; playerId: string },
  sportsPosition?: string,
  mode: ComponentProjectionMode = "PRIMARY"
): ProbableParticipantInput | null {
  const position = normalizeFantasyPosition(fantasyPlannerPosition(sportsPosition ?? null, null, row.position));
  if (position === "UNK") return null;
  const friendMode = mode === "FRIEND_ALT";
  const expectedMinutes = clamp(
    friendMode ? componentMetric(row, "friend_expected_minutes") : row.expectedMinutes ?? 0,
    0,
    90
  );
  const appearance = friendMode
    ? (expectedMinutes > 0 ? 1 : 0)
    : clamp(Math.max(componentMetric(row, "appearance_probability"), expectedMinutes / 90), 0, 1);
  const sixtyMinutes = friendMode
    ? (expectedMinutes >= 60 ? 1 : 0)
    : clamp(Math.min(componentMetric(row, "sixty_minute_probability"), appearance), 0, 1);
  const fullMatch = friendMode
    ? (countsAsFullFantasyMatch(expectedMinutes) ? 1 : 0)
    : clamp(Math.min(componentMetric(row, "full_match_probability"), sixtyMinutes), 0, 1);
  const rate = (key: string) => friendMode
    ? componentMetric(row, `friend_${key}_per_90`)
    : componentRatePer90(row, key);

  return {
    playerId: row.playerId,
    position,
    expectedMinutes,
    per90ExposureFactor: friendMode ? expectedMinutes / 90 : undefined,
    probabilities: { appearance, sixtyMinutes, fullMatch },
    ratesPer90: {
      xg: expectedMinutes > 0 ? rate("xg") : undefined,
      xa: expectedMinutes > 0 ? rate("xa") : undefined,
      recoveries: position !== "GK" && expectedMinutes > 0 ? rate("recoveries") : undefined,
      saves: position === "GK" && expectedMinutes > 0 ? rate("saves") : undefined,
      yellowCards: expectedMinutes > 0 ? rate("yellow_cards") : undefined,
      redCards: expectedMinutes > 0 ? rate("red_cards") : undefined
    }
  };
}

export function componentTeamTotals(
  fixture: PlannerFixture,
  participants: ProbableParticipantInput[],
  mode: ComponentProjectionMode = "PRIMARY"
): ProjectedTeamTotals | null {
  if (fixture.projectedXg === null || fixture.projectedXga === null) return null;
  const modelGoals = fixture.projectedXg;
  const oddsGoals = inversePoissonOver15Probability(fixture.teamOver15Probability);
  const expectedGoals = mode === "FRIEND_ALT" || oddsGoals === null
    ? modelGoals
    : clamp(modelGoals * 0.55 + oddsGoals * 0.45, modelGoals * 0.7, modelGoals * 1.35);
  const expectedRecoveries = participants.reduce((total, player) =>
    total + (player.position === "GK" ? 0 : (player.ratesPer90.recoveries ?? 0) * participantExposureFactor(player)), 0);
  const expectedSaves = participants.reduce((total, player) =>
    total + (player.position === "GK" ? (player.ratesPer90.saves ?? 0) * participantExposureFactor(player) : 0), 0);

  return {
    teamId: fixture.teamId,
    expectedGoals,
    expectedGoalsAgainst: fixture.projectedXga,
    expectedAssists: expectedGoals * 0.8,
    expectedRecoveries,
    expectedSaves,
    cleanSheetProbability: mode === "FRIEND_ALT"
      ? Math.exp(-fixture.projectedXga)
      : fixture.cleanSheetProbability ?? Math.exp(-fixture.projectedXga)
  };
}

export function participantExposureFactor(player: ProbableParticipantInput) {
  return player.per90ExposureFactor ?? (player.expectedMinutes ?? 0) / 90;
}

export function friendStartingRows<T extends SharedMachetePlayerRow>(rows: T[]) {
  return [...rows]
    .sort((left, right) =>
      Number(right.isStarter) - Number(left.isStarter) ||
      (right.startProbability ?? 0) - (left.startProbability ?? 0) ||
      (right.expectedMinutes ?? 0) - (left.expectedMinutes ?? 0) ||
      right.minutesPlayed - left.minutesPlayed
    )
    .slice(0, 11);
}

export function componentMetric(row: Pick<SharedMachetePlayerRow, "rawMetrics">, key: string) {
  return numericOrNull(row.rawMetrics?.[key]) ?? 0;
}

export function componentRatePer90(row: Pick<SharedMachetePlayerRow, "rawMetrics" | "minutesPlayed">, key: string) {
  if (row.minutesPlayed <= 0) return 0;
  return componentMetric(row, key) * 90 / row.minutesPlayed;
}

export function fixtureTeamProjectionKey(fixtureId: string, teamId: string) {
  return `${fixtureId}:${teamId}`;
}

export function fixturePlayerProjectionKey(fixtureId: string, playerId: string) {
  return `${fixtureId}:${playerId}`;
}

export function fantasyPlannerPosition(
  sportsPosition: string | null | undefined,
  rosterPosition: string | null | undefined,
  projectedPosition: string | null | undefined
) {
  const candidates = [sportsPosition, rosterPosition, projectedPosition];
  const known = candidates.find((position) => position && normalizeFantasyPosition(position) !== "UNK");
  return known ?? candidates.find((position) => position?.trim()) ?? null;
}
