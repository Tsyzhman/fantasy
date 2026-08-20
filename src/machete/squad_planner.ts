import { ImportStatus, Prisma, type PrismaClient } from "@prisma/client";

import { formatDate } from "@/lib/format";
import { ExpiringPromiseCache } from "@/lib/expiring-promise-cache";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { normalizeSportsRuPlayerName } from "@/lib/providers/sports-ru-fantasy";
import { FPL_PROVIDER, FPL_SEASON } from "@/lib/providers/fpl";
import { fpl202627Rules } from "@/lib/providers/fpl-rules";
import { aggregateFplForecastResults, fplForecastPointsFromProjection, type FplForecastAdjustments } from "@/lib/providers/fpl-scoring";
import { calculateAlternativeScore, calculateFantasyScore, getActiveScoringModelBundleForSource, type ActiveScoringModel } from "@/lib/scoring";
import {
  calculateCustomFormulaScore,
  calculateCustomFormulaScoreWithBreakdown
} from "@/lib/scoring/formula";
import { friendAlternativeFormulaDefaults } from "@/lib/scoring/formula-display";
import type { UserScoringFormulaPreference } from "@/lib/scoring/user-preferences";
import { providerTeamShortName } from "@/lib/teams/display";
import { playerPhotoPublicUrl } from "./player-photo-cache";
import {
  expectedProjectionFormulaConfig,
  friendAltProjectionFormulaConfig,
  parseProjectionFormulaConfig,
  type ProjectionFormulaConfig
} from "./projection-formula-config";
import {
  ProjectionInputError,
  projectTeamPlayers,
  type PlayerFixtureProjection,
  type PlayerFantasyPointComponents,
  type ProbableParticipantInput,
  type ProjectedTeamTotals
} from "./deterministic_fantasy_projection";

import type { FantasyBacktestSample } from "./fantasy_backtest";
import {
  FANTASY_PROJECTION_CALIBRATION,
  predictCalibratedFantasyPoints,
  type FantasyProjectionCalibrationModel
} from "./fantasy_projection_calibration";
import { loadFantasyProjectionCalibration } from "./fantasy_projection_service";
import {
  addPromotedFormulaAdaptationTeamProfiles,
  addFormulaAdaptationInteractions,
  aggregateFormulaAdaptationPredictions,
  buildFormulaAdaptationTeamProfiles,
  formulaAdaptationMinuteFeatures,
  formulaAdaptationFixtureFeatures,
  predictFormulaAdaptationsWithBreakdowns,
  type FormulaAdaptationBreakdowns,
  type FormulaAdaptationFeatures,
  type FormulaAdaptationShot,
  type FormulaAdaptationTeamProfiles,
  type FormulaAdaptationTeamStat
} from "./formula_adaptations";
import { FANTASY_MODEL_VERSION } from "./foontasy_style_model";
import {
  archivedExpectedMinutes,
  blendArchivedEventRate,
  FEEDER_TO_TOP_EVENT_FACTOR,
  positionEventPriorPer90
} from "./player-season-prior";
import { loadPlannerReadinessByScope, plannerReadinessKey, type PlannerReadiness } from "./planner_readiness";
import {
  defaultFantasyHistorySettings,
  fantasyHistorySettingsKey,
  resolveFantasyHistory,
  type FantasyHistorySettings,
  type ResolvedFantasyHistory
} from "./squad-history";
import {
  loadSharedMachetePlayerRows,
  type SharedLeagueSeasonOption,
  type SharedMachetePlayerRow,
  type SharedPlayerRowsScope,
  type SharedRosterOverride
} from "./shared_read_model";
import {
  defaultFantasySquadRules,
  countFantasySquadTransfers,
  fantasyTransferLimitForHorizon,
  fantasyProviderPlaceholderPlannerPlayer,
  fantasyProviderPlaceholdersFromFilters,
  isFantasyProviderPlaceholderPlayerId,
  isFantasySquadPlayerId,
  parseFantasyProviderPlaceholders,
  transfersPerFantasyRound,
  normalizeFantasyHorizon,
  normalizeFantasyPosition,
  roundFantasyValue,
  summarizeFantasySquad,
  createFantasySquadRoundPlans,
  validateFantasySquadForSave,
  type FantasyProjectionFixtureInputs,
  type FantasyPlannerPlayer,
  type FantasyProviderPlaceholder,
  type FantasyPositionGroup,
  type FantasyRoundProjection,
  type FantasySquadRules,
  type FantasySquadSelection,
  type FantasySquadRoundPlan
} from "./squad_logic";

export type SavedFantasySquad = {
  id: string | null;
  name: string;
  leagueId: string;
  season: string;
  horizonRounds: number;
  selections: FantasySquadSelection[];
  roundPlans: FantasySquadRoundPlan[];
};

export type SavedFantasySquadOption = {
  id: string;
  name: string;
  playersCount: number;
  updatedAt: string;
};

export type FantasySquadPlannerData = {
  provider: string;
  contestId: string | null;
  readiness: PlannerReadiness;
  rules: FantasySquadRules;
  rounds: FantasyRoundProjection[];
  bookmakerFavorites: FantasyBookmakerFavorite[];
  players: FantasyPlannerPlayer[];
  squad: SavedFantasySquad;
  squads: SavedFantasySquadOption[];
  priceStatus: {
    sportsRuPrices: number;
    fplPrices: number;
    estimatedPrices: number;
    lastSyncedAt: string | null;
  };
  historySeasonOptions: string[];
  formulaAdaptationBreakdownsByPlayerId: Record<string, FormulaAdaptationBreakdowns>;
};

export type FantasyBookmakerFavorite = {
  fixtureId: string;
  roundId: string;
  roundLabel: string;
  kickoffAt: string | null;
  teamId: string;
  teamName: string;
  teamFullName: string;
  opponentTeamId: string | null;
  opponentName: string;
  opponentFullName: string;
  side: "H" | "A";
  teamOver15Probability: number;
  cleanSheetProbability: number;
  oddsFetchedAt: string;
  source: "FONBET";
};

export type PlannerFixture = {
  id: string;
  roundId: string;
  teamId: string;
  teamName?: string;
  teamFullName?: string;
  opponentTeamId: string | null;
  opponentName: string;
  opponentFullName: string;
  side: "H" | "A";
  kickoffAt: Date | null;
  projectedXg: number | null;
  projectedXga: number | null;
  attackMultiplier: number | null;
  defenseMultiplier: number | null;
  teamOver15Probability?: number | null;
  cleanSheetProbability?: number | null;
  oddsFetchedAt?: Date | null;
  finished?: boolean;
};

function buildFixtureComponentInputs(
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

function numericProjectionMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringProjectionMetric(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function minuteHistorySourceMetric(value: unknown): FantasyProjectionFixtureInputs["minuteHistorySource"] {
  return value === "NONE" || value === "CURRENT_CLUB" || value === "PREVIOUS_CLUB_FALLBACK" || value === "MIXED"
    ? value
    : null;
}

type PlannerMatch = {
  id: string;
  round: string | null;
  providerRoundId?: string | null;
  providerRoundLabel?: string | null;
  providerRoundOrdinal?: number | null;
  matchDate: Date | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeTeamFullName?: string | null;
  awayTeamFullName?: string | null;
  finished: boolean;
  cancelled: boolean;
  homeOver15Probability?: number | null;
  awayOver15Probability?: number | null;
  homeCleanSheetProbability?: number | null;
  awayCleanSheetProbability?: number | null;
  oddsFetchedAt?: Date | null;
};

export type FantasyFixtureProjection = Pick<PlannerFixture, "side" | "attackMultiplier" | "defenseMultiplier">;

export type PlannerRoundFixtures = {
  rounds: FantasyRoundProjection[];
  fixturesByTeamRound: Map<string, Map<string, PlannerFixture[]>>;
  teamShortNameById: Map<string, string>;
  formulaAdaptationTeamProfiles?: FormulaAdaptationTeamProfiles;
};

export type FantasyProjectionEngine = "COMPONENT_XFP_V1" | "LEGACY_RIDGE19_V1";

type ComponentProjectionIndex = {
  byFixturePlayer: Map<string, PlayerFixtureProjection>;
  formulaMetricsByFixturePlayer: Map<string, Record<string, unknown>>;
  errorsByFixtureTeam: Map<string, string>;
};

type ComponentProjectionMode = "PRIMARY" | "FRIEND_ALT";

type TeamStrengthSide = "home" | "away";

type TeamStrengthSample = {
  teamId: string;
  side: TeamStrengthSide;
  xgFor: number | null;
  xgAgainst: number | null;
  weight: number;
};

type TeamStrengthBlock = {
  matches: number;
  xgForPerMatch: number | null;
  xgAgainstPerMatch: number | null;
};

type TeamStrengthProfile = {
  home: TeamStrengthBlock;
  away: TeamStrengthBlock;
  overall: TeamStrengthBlock;
};

type TeamStrengthProfiles = {
  byTeamId: Map<string, TeamStrengthProfile>;
  league: TeamStrengthProfile;
};

type TeamStrengthMatchInput = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  matchDate?: Date | string | null;
  teamStats: FormulaAdaptationTeamStat[];
  shots?: FormulaAdaptationShot[];
};

type SportsRuPositionPriceRow = {
  id: string;
  playerId: bigint | null;
  position: string | null;
  positionLabel?: string | null;
  sourceKind?: string | null;
  sourceRowIndex?: number | null;
};

type SportsRuPositionMapRow = {
  providerEntityId: string;
  internalEntityId: string | null;
};

type SportsRuScopedPriceRow = SportsRuPositionPriceRow & {
  leagueId: bigint;
  season: string;
  playerName: string;
  price: number;
};

export type SportsRuRosterPriceRow = SportsRuPositionPriceRow & {
  leagueId: bigint;
  season: string;
  teamId: bigint | null;
  lastSeenAt: Date;
  player: {
    id: bigint;
    name: string;
    country: string | null;
  } | null;
  team: {
    id: bigint;
    name: string;
  } | null;
};

export type FantasyPlannerRosterRow = {
  leagueId: bigint;
  season: string;
  teamId: bigint;
  playerId: bigint;
  position: string | null;
  age: number | null;
  nationality: string | null;
  photoUrl: string | null;
  isStarter?: boolean | null;
  player: {
    name: string;
  };
  team: {
    name: string;
  };
};

type BaltikaPlayerMetric = {
  xg: number | null;
  xa: number | null;
  matchesPlayed: number | null;
  minutesPlayed: number | null;
  teamName: string;
};

export type SportsRuFantasyPriceRef = {
  playerId: string;
  leagueId: string;
  season: string;
  playerName: string;
  position: string | null;
  price: number;
};

const maxProjectionRounds = 10;
const defaultTeamXgPerMatch = 1.25;
const teamStrengthHalfLifeDays = 180;
const teamStrengthOverallPriorMatches = 6;
const teamStrengthVenuePriorMatches = 8;
const promotedTeamPriorMatches = 8;
const promotedTeamStrengthFactor = 0.81;
const promotedTeamRatioExponent = 0.6;
const teamStrengthFeederLeagueByTopLeague = new Map<string, bigint>([
  ["38", 119n],
  ["40", 264n],
  ["47", 48n],
  ["48", 108n],
  ["53", 110n],
  ["54", 146n],
  ["55", 86n],
  ["57", 111n],
  ["61", 185n],
  ["63", 338n],
  ["64", 123n],
  ["69", 163n],
  ["71", 165n],
  ["87", 140n]
]);
const fixtureOddsMaximumAgeMs = 35 * 24 * 60 * 60_000;
const fantasyPlayerPoolCacheTtlMs = 5 * 60_000;
const fantasyPlayerPoolCache = new ExpiringPromiseCache<string, FantasyPlannerPlayer[]>(20);
const fantasyFormulaAdaptationBreakdownCache = new ExpiringPromiseCache<string, FormulaAdaptationBreakdowns | null>(120);
const upcomingRoundFixturesCacheTtlMs = 5 * 60_000;
const upcomingRoundFixturesCache = new ExpiringPromiseCache<string, PlannerRoundFixtures>(20);
export const maxFantasySquadNameLength = 80;

export async function loadCachedFantasySquadPlayerPool(
  prisma: PrismaClient,
  userId: string,
  league: SharedLeagueSeasonOption,
  historySettings: FantasyHistorySettings = defaultFantasyHistorySettings,
  provider = "SPORTS_RU",
  contestId?: string | null
) {
  const contestMetadata = await fantasyContestCacheMetadata(prisma, league, provider, contestId);
  const resolvedContestId = contestMetadata.contestId;
  const [preference, latestStartingXiChange, foontasyRevision] = await Promise.all([
    prisma.userScoringPreference.findUnique({
      where: { userId_modelSource: { userId, modelSource: "MACHETE" } },
      select: { id: true, updatedAt: true }
    }),
    prisma.leagueSeasonTeam.aggregate({
      where: { leagueId: league.leagueId, season: league.season, active: true },
      _max: { startingXiChangedAt: true }
    }),
    provider === FPL_PROVIDER && resolvedContestId
      ? loadLatestFplOfficialScoreRevision(prisma, resolvedContestId)
      : loadLatestFoontasyForecastRevision(prisma, league)
  ]);
  const preferenceKey = preference ? `${preference.id}:${preference.updatedAt.toISOString()}` : "global";
  const startingXiRevision = latestStartingXiChange._max.startingXiChangedAt?.toISOString() ?? "no-xi-change";
  return loadCachedFantasySquadPlayerPoolWithMetadata(
    prisma,
    userId,
    league,
    historySettings,
    preferenceKey,
    startingXiRevision,
    foontasyRevision,
    contestMetadata.revision,
    provider,
    resolvedContestId
  );
}

export type CachedFantasySquadPlayerPoolResult =
  | { players: FantasyPlannerPlayer[]; error: null }
  | { players: null; error: unknown };

export async function loadCachedFantasySquadPlayerPools(
  prisma: PrismaClient,
  userIds: string[],
  league: SharedLeagueSeasonOption,
  historySettings: FantasyHistorySettings = defaultFantasyHistorySettings,
  provider = "SPORTS_RU",
  contestId?: string | null
) {
  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) return new Map<string, CachedFantasySquadPlayerPoolResult>();
  const contestMetadata = await fantasyContestCacheMetadata(prisma, league, provider, contestId);
  const resolvedContestId = contestMetadata.contestId;
  const [preferences, latestStartingXiChange, foontasyRevision] = await Promise.all([
    prisma.userScoringPreference.findMany({
      where: { userId: { in: uniqueUserIds }, modelSource: "MACHETE" },
      select: { userId: true, id: true, updatedAt: true }
    }),
    prisma.leagueSeasonTeam.aggregate({
      where: { leagueId: league.leagueId, season: league.season, active: true },
      _max: { startingXiChangedAt: true }
    }),
    provider === FPL_PROVIDER && resolvedContestId
      ? loadLatestFplOfficialScoreRevision(prisma, resolvedContestId)
      : loadLatestFoontasyForecastRevision(prisma, league)
  ]);
  const startingXiRevision = latestStartingXiChange._max.startingXiChangedAt?.toISOString() ?? "no-xi-change";
  const groups = fantasyPlayerPoolPreferenceGroups(uniqueUserIds, preferences);
  const results = new Map<string, CachedFantasySquadPlayerPoolResult>();
  await Promise.all([...groups.entries()].map(async ([preferenceKey, group]) => {
    try {
      const players = await loadCachedFantasySquadPlayerPoolWithMetadata(
        prisma,
        group.representativeUserId,
        league,
        historySettings,
        preferenceKey,
        startingXiRevision,
        foontasyRevision,
        contestMetadata.revision,
        provider,
        resolvedContestId
      );
      for (const userId of group.userIds) results.set(userId, { players, error: null });
    } catch (error) {
      for (const userId of group.userIds) results.set(userId, { players: null, error });
    }
  }));
  return results;
}

export function fantasyPlayerPoolPreferenceGroups(
  userIds: string[],
  preferences: Array<{ userId: string; id: string; updatedAt: Date }>
) {
  const preferenceByUserId = new Map(preferences.map((preference) => [preference.userId, preference]));
  const groups = new Map<string, { representativeUserId: string; userIds: string[] }>();
  for (const userId of [...new Set(userIds)]) {
    const preference = preferenceByUserId.get(userId);
    const preferenceKey = preference ? `${preference.id}:${preference.updatedAt.toISOString()}` : "global";
    const group = groups.get(preferenceKey);
    if (group) group.userIds.push(userId);
    else groups.set(preferenceKey, { representativeUserId: userId, userIds: [userId] });
  }
  return groups;
}

function loadCachedFantasySquadPlayerPoolWithMetadata(
  prisma: PrismaClient,
  userId: string,
  league: SharedLeagueSeasonOption,
  historySettings: FantasyHistorySettings,
  preferenceKey: string,
  startingXiRevision: string,
  foontasyRevision: string,
  contestRevision: string,
  provider: string,
  contestId?: string | null
) {
  const key = fantasyPlayerPoolCacheKey({
    provider,
    contestId,
    leagueId: league.leagueId,
    season: league.season,
    leagueUpdatedAt: league.updatedAt,
    startingXiRevision,
    foontasyRevision,
    contestRevision,
    preferenceKey,
    historySettingsKey: fantasyHistorySettingsKey(historySettings)
  });
  return fantasyPlayerPoolCache.getOrCreate(key, fantasyPlayerPoolCacheTtlMs, async () => {
    const data = await loadFantasySquadPlannerData(prisma, userId, league, null, { historySettings, skipSavedSquads: true, provider, contestId });
    return data.players;
  });
}

export async function loadFantasySquadPlannerData(
  prisma: PrismaClient,
  userId: string,
  league: SharedLeagueSeasonOption,
  squadId?: string | null,
  options?: {
    playerIds?: bigint[];
    readiness?: PlannerReadiness;
    historySettings?: FantasyHistorySettings;
    deferFormulaProjections?: boolean;
    skipSavedSquads?: boolean;
    includeFormulaAdaptationBreakdowns?: boolean;
    provider?: string;
    contestId?: string | null;
  }
): Promise<FantasySquadPlannerData> {
  const provider = options?.provider ?? "SPORTS_RU";
  const isFpl = provider === FPL_PROVIDER;
  if (isFpl && (league.leagueId !== 47n || league.season !== FPL_SEASON)) {
    throw new Error(`FPL is available only for CoreLeague 47 season ${FPL_SEASON}.`);
  }
  const readiness = options?.readiness ?? (await loadPlannerReadinessByScope(prisma, [league])).get(plannerReadinessKey(league));
  if (!readiness) throw new Error(`Planner readiness could not be evaluated for ${league.leagueId}:${league.season}.`);
  const history = await resolveFantasyHistory(prisma, league, options?.historySettings ?? defaultFantasyHistorySettings);
  const starterStatusKnown = !isFpl || await hasCompletedCoreLeagueMatch(prisma, league);
  const sportsRuSeasons = sportsRuSeasonAliases(league.season);
  const contest = await fantasyContestClient(prisma).findFirst({
    where: {
      provider,
      leagueId: league.leagueId,
      season: isFpl ? FPL_SEASON : { in: sportsRuSeasons }
    },
    orderBy: { lastSyncedAt: "desc" }
  });
  const scopedContest = options?.contestId
    ? await fantasyContestClient(prisma).findFirst({
        where: {
          id: options.contestId,
          provider,
          leagueId: league.leagueId,
          season: isFpl ? FPL_SEASON : { in: sportsRuSeasons }
        }
      })
    : contest;
  if (options?.contestId && !scopedContest) throw new Error("Fantasy contest does not exist for the selected provider and league season.");
  const { priceRows, priceMaps, rosterOverrides } = isFpl
    ? await loadFplRosterPriceContext(prisma, league, scopedContest?.id ?? null, options?.playerIds)
    : await loadSportsRuAuthoritativeRosterContext(prisma, league, options?.playerIds, scopedContest?.id ?? null);
  const [savedSquads, fotmobRosterRows, playerRows, roundsAndFixtures, foontasyRows, modelForecastRows, baltikaMetricsByName, fplOfficialScoreRows] = await Promise.all([
    options?.skipSavedSquads
      ? Promise.resolve([])
      : prisma.userFantasySquad.findMany({
          where: {
            userId,
            provider,
            contestId: scopedContest?.id ?? "__missing_fantasy_contest__",
            leagueId: league.leagueId,
            season: league.season
          },
          include: {
            players: {
              orderBy: { slotIndex: "asc" }
            }
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
        }),
    prisma.teamPlayerSeason.findMany({
      where: {
        leagueId: league.leagueId,
        season: league.season,
        active: true,
        ...(options?.playerIds !== undefined ? { playerId: { in: options.playerIds } } : {})
      },
      include: {
        player: true,
        team: true
      },
      orderBy: [{ team: { name: "asc" } }, { player: { name: "asc" } }]
    }),
    loadProjectedPlayerRows(
      prisma,
      userId,
      league,
      history,
      options?.playerIds,
      options?.deferFormulaProjections,
      rosterOverrides,
      isFpl && !starterStatusKnown
    ),
    loadUpcomingRoundFixtures(
      prisma,
      league,
      provider,
      scopedContest?.id ?? null,
      scopedContest?.scheduleRevision ?? null
    ),
    isFpl
      ? Promise.resolve([])
      : prisma.foontasyForecast.findMany({
          where: { leagueId: league.leagueId, season: league.season, sourceVariant: "sports", playerId: { not: null } },
          orderBy: [{ fetchedAt: "desc" }, { updatedAt: "desc" }],
          distinct: ["playerId"],
          select: { playerId: true, points: true, fetchedAt: true }
        }),
    isFpl
      ? Promise.resolve([])
      : prisma.fantasyModelForecast?.findMany({
          where: { leagueId: league.leagueId, season: league.season, modelVersion: FANTASY_MODEL_VERSION, horizon: { in: [3, 5] } },
          select: { playerId: true, horizon: true, points: true, status: true, calculatedAt: true }
        }) ?? Promise.resolve([]),
    loadBaltikaPlayerMetricsByName(prisma, sportsRuSeasons),
    isFpl && scopedContest
      ? prisma.fantasyProviderPlayerMatchScore.findMany({
          where: {
            contestId: scopedContest.id,
            provider: FPL_PROVIDER,
            status: "OFFICIAL",
            ...(options?.playerIds !== undefined ? { playerId: { in: options.playerIds } } : { playerId: { not: null } })
          },
          orderBy: [{ gameweek: "desc" }, { fetchedAt: "desc" }],
          select: { playerId: true, gameweek: true, points: true, breakdown: true, status: true }
        })
      : Promise.resolve([])
  ]);
  const rosterRows = isFpl
    ? fotmobRosterRows.map((row) => ({
        leagueId: row.leagueId,
        season: row.season,
        teamId: row.teamId,
        playerId: row.playerId,
        position: row.position,
        age: row.age,
        nationality: row.nationality,
        photoUrl: row.photoUrl,
        isStarter: isFpl && !starterStatusKnown ? null : row.isStarter,
        player: { name: row.player.name },
        team: { name: row.team.name }
      }))
    : applySportsRuRosterOverrides(
    fotmobRosterRows.map((row) => ({
      leagueId: row.leagueId,
      season: row.season,
      teamId: row.teamId,
      playerId: row.playerId,
      position: row.position,
      age: row.age,
      nationality: row.nationality,
      photoUrl: row.photoUrl,
        isStarter: isFpl && !starterStatusKnown ? undefined : row.isStarter === true,
      player: { name: row.player.name },
      team: { name: row.team.name }
    })),
    rosterOverrides
  );
  const rosterPlayerCount = rosterRows.length;
  const savedSquad = (squadId ? savedSquads.find((squad) => squad.id === squadId) : null) ?? savedSquads[0] ?? null;
  const rules = fantasyRulesForLeague(league, scopedContest ?? null, provider);
  const prices = priceLookup(priceRows, priceMaps);
  const foontasyByPlayerId = new Map(foontasyRows.flatMap((row) => row.playerId ? [[String(row.playerId), row] as const] : []));
  const modelForecastByPlayerHorizon = new Map(modelForecastRows.map((row) => [`${row.playerId}:${row.horizon}`, row] as const));
  const officialFplPointsByPlayerId = isFpl ? buildFplRecentOfficialPoints(fplOfficialScoreRows) : new Map<string, number[]>();
  const fplPositionsByPlayerId = new Map<string, Exclude<FantasyPositionGroup, "UNK">>(isFpl
    ? [...prices.byPlayerId.entries()].flatMap(([playerId, row]) => {
        const position = normalizeFantasyPosition(row.position);
        return position === "UNK" ? [] : [[playerId, position] as const];
      })
    : []);
  const officialFplForecastAdjustmentsByPlayerId = isFpl
    ? buildFplOfficialForecastAdjustments(fplOfficialScoreRows, fplPositionsByPlayerId)
    : new Map<string, FplForecastAdjustments>();
  const providerPositionsByPlayerId = isFpl
    ? new Map([...fplPositionsByPlayerId].map(([playerId, position]) => [playerId, position]))
    : sportsRuFantasyPositionsByPlayerId(priceRows, priceMaps);
  const projectionRows = isFpl && !starterStatusKnown
    ? {
        ...playerRows,
        rows: playerRows.rows.map((row) => ({ ...row, isStarter: false })),
        friendRows: playerRows.friendRows.map((row) => ({ ...row, isStarter: false }))
      }
    : playerRows;
  const effectivePlayerRows = projectionRows;
  const projectedByPlayerTeam = new Map(effectivePlayerRows.rows.map((row) => [playerTeamKey(row.playerId, row.teamId), row]));
  const friendByPlayerTeam = new Map(effectivePlayerRows.friendRows.map((row) => [playerTeamKey(row.playerId, row.teamId), row]));
  const componentProjections = options?.deferFormulaProjections
    ? emptyComponentProjectionIndex()
    : buildFormulaProjectionIndex(
        effectivePlayerRows.friendRows,
        roundsAndFixtures,
        providerPositionsByPlayerId,
        effectivePlayerRows.expectedProjectionConfig,
        false,
        isFpl ? "FPL" : "GENERIC"
      );
  const friendAlternativeProjections = options?.deferFormulaProjections
    ? emptyComponentProjectionIndex()
    : buildFormulaProjectionIndex(
        effectivePlayerRows.friendRows,
        roundsAndFixtures,
        providerPositionsByPlayerId,
        effectivePlayerRows.alternativeProjectionConfig,
        true,
        isFpl ? "FPL" : "GENERIC"
      );
  const preferredProjectionEngine = configuredFantasyProjectionEngine();
  const formulaAdaptationBreakdownsByPlayerId: Record<string, FormulaAdaptationBreakdowns> = {};
  const rosterPlayers: FantasyPlannerPlayer[] = rosterRows.flatMap((row) => {
    const playerId = String(row.playerId);
    const teamId = String(row.teamId);
    const projected = projectedByPlayerTeam.get(playerTeamKey(row.playerId, row.teamId));
    const teamFixturesByRound = roundsAndFixtures.rounds.map((round) =>
      roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(teamId) ?? []
    );
    const nextRoundFixtures = teamFixturesByRound[0] ?? [];
    const nextFixture = nearestPlannerFixture(teamFixturesByRound.flat());
    const priceRow = prices.byPlayerId.get(playerId);
    const providerPosition = providerPositionsByPlayerId.get(playerId) ?? (priceRow ? sportsRuPricePosition(priceRow) : null);
    const position = fantasyPlannerPosition(providerPosition, row.position, projected?.position ?? null);
    const positionGroup = normalizeFantasyPosition(position);
    const legacyFixturePoints = (fixture: PlannerFixture) => {
      if (!projected) return null;
      const fixturePoints = calibratedPlayerFixturePoints(
        projected,
        fixture,
        playerRows.calibration?.model ?? null,
        playerRows.scoringModel
      ) ?? 0;
      return playerRows.calibration
        ? fixturePoints
        : projectFixtureFantasyPoints(fixturePoints, positionGroup, fixture);
    };
    const legacyPredictedFp = !isFpl && projected
      ? roundsAndFixtures.rounds.length > 0
        ? roundFantasyValue(nextRoundFixtures.reduce((total, fixture) => total + (legacyFixturePoints(fixture) ?? 0), 0))
        : calibratedPlayerFixturePoints(projected, nextFixture, playerRows.calibration?.model ?? null, playerRows.scoringModel)
      : null;
    const foontasy = foontasyByPlayerId.get(String(row.playerId)) ?? null;
    const modelT3 = modelForecastByPlayerHorizon.get(`${row.playerId}:3`) ?? null;
    const modelT5 = modelForecastByPlayerHorizon.get(`${row.playerId}:5`) ?? null;
    const nextFixturePlayerKey = fixturePlayerProjectionKey(nextFixture?.id ?? "", playerId);
    const nextComponentProjection = nextFixture
      ? componentProjections.byFixturePlayer.get(nextFixturePlayerKey) ?? null
      : null;
    const nextComponentFormulaMetrics = nextFixture
      ? componentProjections.formulaMetricsByFixturePlayer.get(nextFixturePlayerKey)
      : undefined;
    const nextComponentRoundFormula = !isFpl
      ? projectionRoundFormulaWithBreakdown(
          nextRoundFixtures,
          playerId,
          componentProjections,
          effectivePlayerRows.expectedProjectionConfig
        )
      : null;
    const nextComponentRoundProjections = nextRoundFixtures.map((fixture) =>
      componentProjections.byFixturePlayer.get(fixturePlayerProjectionKey(fixture.id, playerId)) ?? null
    );
    const completeNextComponentRound = nextComponentRoundProjections.every(
      (projection): projection is PlayerFixtureProjection => projection !== null
    );
    const nextComponentRoundComponents = completeNextComponentRound
      ? aggregatePlayerFantasyPointComponents(nextComponentRoundProjections.map((projection) => projection.components))
      : null;
    const nextFplForecast = isFpl && completeNextComponentRound && nextComponentRoundProjections.length > 0
      ? aggregateFplForecastResults(nextComponentRoundProjections.map((projection) =>
          fplForecastPointsFromProjection(projection, officialFplForecastAdjustmentsByPlayerId.get(playerId))
        ))
      : null;
    const componentPredictedFp = isFpl
      ? roundsAndFixtures.rounds.length > 0 && nextRoundFixtures.length === 0
        ? 0
        : nextFplForecast ? roundFantasyValue(nextFplForecast.points) : null
      : roundsAndFixtures.rounds.length > 0 && nextRoundFixtures.length === 0
        ? 0
        : nextComponentRoundFormula?.total ?? null;
    const projectionEngine: FantasyProjectionEngine =
      isFpl || (preferredProjectionEngine === "COMPONENT_XFP_V1" && componentPredictedFp !== null)
        ? "COMPONENT_XFP_V1"
        : "LEGACY_RIDGE19_V1";
    const predictedFp = isFpl
      ? componentPredictedFp
      : projectionEngine === "COMPONENT_XFP_V1" ? componentPredictedFp : legacyPredictedFp;
    const nextFriendProjection = nextFixture
      ? friendAlternativeProjections.byFixturePlayer.get(nextFixturePlayerKey) ?? null
      : null;
    const nextFriendFormulaMetrics = nextFixture
      ? friendAlternativeProjections.formulaMetricsByFixturePlayer.get(nextFixturePlayerKey)
      : undefined;
    const nextFriendRoundFormula = !isFpl
      ? projectionRoundFormulaWithBreakdown(
          nextRoundFixtures,
          playerId,
          friendAlternativeProjections,
          playerRows.alternativeProjectionConfig
        )
      : null;
    const nextFriendRoundProjections = nextRoundFixtures.map((fixture) =>
      friendAlternativeProjections.byFixturePlayer.get(fixturePlayerProjectionKey(fixture.id, playerId)) ?? null
    );
    const completeNextFriendRound = nextFriendRoundProjections.every(
      (projection): projection is PlayerFixtureProjection => projection !== null
    );
    const nextFriendRoundComponents = completeNextFriendRound
      ? aggregatePlayerFantasyPointComponents(nextFriendRoundProjections.map((projection) => projection.components))
      : null;
    const nextFplAlternativeForecast = isFpl && completeNextFriendRound && nextFriendRoundProjections.length > 0
      ? aggregateFplForecastResults(nextFriendRoundProjections.map((projection) =>
          fplForecastPointsFromProjection(projection, officialFplForecastAdjustmentsByPlayerId.get(playerId))
        ))
      : null;
    const alternativePredictedFp = isFpl
      ? roundsAndFixtures.rounds.length > 0 && nextRoundFixtures.length === 0
        ? 0
        : nextFplAlternativeForecast ? roundFantasyValue(nextFplAlternativeForecast.points) : null
      : roundsAndFixtures.rounds.length > 0 && nextRoundFixtures.length === 0
        ? 0
        : nextFriendRoundFormula?.total ?? null;
    const price = resolveFantasyPlannerPrice(priceRow, predictedFp, positionGroup, provider);
    const playerName = priceRow?.playerName ?? row.player.name;
    const baltikaMetric = baltikaMetricsByName.get(normalizeSportsRuPlayerName(playerName));
    const friendHistory = friendByPlayerTeam.get(playerTeamKey(row.playerId, row.teamId));
    const recentFp = isFpl
      ? officialFplPointsByPlayerId.get(String(row.playerId)) ?? []
      : projected?.recentFp ?? [];
    const formulaAdaptationRound = !isFpl && nextRoundFixtures.length > 0
      ? aggregateFormulaAdaptationPredictions(nextRoundFixtures.map((fixture, index) => {
          const componentProjection = nextComponentRoundProjections[index];
          const friendProjection = nextFriendRoundProjections[index];
          const componentKey = fixturePlayerProjectionKey(fixture.id, playerId);
          const componentFormulaMetrics = componentProjections.formulaMetricsByFixturePlayer.get(componentKey);
          const friendFormulaMetrics = friendAlternativeProjections.formulaMetricsByFixturePlayer.get(componentKey);
          const componentFixturePoints = componentProjection
            ? projectionFormulaFantasyPoints(
                componentProjection,
                fixture,
                playerRows.expectedProjectionConfig,
                componentFormulaMetrics
              )
            : null;
          const friendFixturePoints = friendProjection
            ? projectionFormulaFantasyPoints(
                friendProjection,
                fixture,
                playerRows.alternativeProjectionConfig,
                friendFormulaMetrics
              )
            : null;
          const fo = projectionEngine === "COMPONENT_XFP_V1"
            ? componentFixturePoints
            : legacyFixturePoints(fixture);
          const features: FormulaAdaptationFeatures = addFormulaAdaptationInteractions({
            ...(friendHistory?.formulaAdaptationFeatures ?? {}),
            ...formulaAdaptationFixtureFeatures({
              profiles: roundsAndFixtures.formulaAdaptationTeamProfiles,
              teamId,
              opponentTeamId: fixture.opponentTeamId,
              kickoffAt: fixture.kickoffAt,
              side: fixture.side
            }),
            ...formulaAdaptationMinuteFeatures(
              "fo",
              fo,
              buildFixtureComponentInputs(componentProjection, componentFormulaMetrics)
            ),
            ...formulaAdaptationMinuteFeatures(
              "alt",
              friendFixturePoints,
              buildFixtureComponentInputs(friendProjection, friendFormulaMetrics)
            ),
            age: projected?.age ?? row.age ?? null,
            role_side: positionGroup === "GK" ? "center" : "unknown"
          });
          return {
            fixtureId: fixture.id,
            fixtureLabel: `${fixture.side} ${fixture.opponentName}`,
            prediction: predictFormulaAdaptationsWithBreakdowns({
              leagueId: league.leagueId,
              position: positionGroup,
              fo,
              alt: friendFixturePoints,
              features
            })
          };
        }))
      : null;
    const formulaAdaptations = isFpl
      ? emptyFormulaAdaptationForecasts()
      : formulaAdaptationRound?.forecasts ?? emptyFormulaAdaptationForecasts();
    if (!isFpl && options?.includeFormulaAdaptationBreakdowns && formulaAdaptationRound) {
      formulaAdaptationBreakdownsByPlayerId[playerId] = formulaAdaptationRound.breakdowns;
    }
    const legacyRoundPoints = teamFixturesByRound.map((fixtures) => {
      return roundFantasyValue(
        fixtures.reduce((total, fixture) => total + (legacyFixturePoints(fixture) ?? 0), 0)
      );
    });
    const componentRoundPoints = teamFixturesByRound.map((fixtures) => {
      if (fixtures.length === 0) return 0;
      const values = fixtures.map((fixture) => {
        const projection = componentProjections.byFixturePlayer.get(fixturePlayerProjectionKey(fixture.id, playerId));
        const key = fixturePlayerProjectionKey(fixture.id, playerId);
        if (!projection) return null;
        if (isFpl) return fplForecastPointsFromProjection(
          projection,
          officialFplForecastAdjustmentsByPlayerId.get(playerId)
        ).points;
        return projectionFormulaFantasyPoints(
          projection,
          fixture,
          playerRows.expectedProjectionConfig,
          componentProjections.formulaMetricsByFixturePlayer.get(key)
        );
      });
      return values.some((value) => value === null)
        ? null
        : roundFantasyValue(values.reduce<number>((total, value) => total + (value ?? 0), 0));
    });
    const roundPoints = roundsAndFixtures.rounds.map((_, index) => isFpl
      ? componentRoundPoints[index] ?? 0
      : projectionEngine === "COMPONENT_XFP_V1" && componentRoundPoints[index] !== null
        ? componentRoundPoints[index] ?? 0
        : legacyRoundPoints[index] ?? 0
    );
    const alternativeRoundPoints = teamFixturesByRound.map((fixtures) => {
      if (fixtures.length === 0) return 0;
      const values = fixtures.map((fixture) => {
        const projection = friendAlternativeProjections.byFixturePlayer.get(fixturePlayerProjectionKey(fixture.id, playerId));
        const key = fixturePlayerProjectionKey(fixture.id, playerId);
        if (!projection) return null;
        if (isFpl) return fplForecastPointsFromProjection(
          projection,
          officialFplForecastAdjustmentsByPlayerId.get(playerId)
        ).points;
        return projectionFormulaFantasyPoints(
          projection,
          fixture,
          playerRows.alternativeProjectionConfig,
          friendAlternativeProjections.formulaMetricsByFixturePlayer.get(key)
        );
      });
      return values.some((value) => value === null)
        ? null
        : roundFantasyValue(values.reduce<number>((total, value) => total + (value ?? 0), 0));
    });
    const roundFixtureCounts = teamFixturesByRound.map((teamFixtures) => teamFixtures.length);
    const fixtures = teamFixturesByRound.map((teamFixtures) => {
      return teamFixtures.map((fixture) => `${fixture.side} ${fixture.opponentName}`).join(", ");
    });
    const fixtureFullNames = teamFixturesByRound.map((teamFixtures) => {
      return teamFixtures.map((fixture) => `${fixture.side} ${fixture.opponentFullName}`).join(", ");
    });
    const fixtureDifficulties = teamFixturesByRound.map((teamFixtures) => {
      return aggregateRoundDifficulty(teamFixtures, positionGroup);
    });
    const forecastExplanation = buildFantasyForecastExplanation({
      matchesPlayed: projected?.matchesPlayed ?? 0,
      expectedMinutes: nextComponentProjection?.expectedMinutes ?? projected?.expectedMinutes ?? null,
      forecastConfidence: projected?.forecastConfidence ?? null,
      recentFp,
      fixtureDifficulties,
      isStarter: row.isStarter === true
    });
    if (projectionEngine === "COMPONENT_XFP_V1" && componentPredictedFp !== null) {
      forecastExplanation.factors.unshift("Component xFP: team forecast allocated by player xG/xA and expected minutes");
      if (nextFixture?.teamOver15Probability !== null && nextFixture?.teamOver15Probability !== undefined) {
        forecastExplanation.factors.push("Fresh bookmaker team-goal probability included");
      }
      if (nextFixture?.cleanSheetProbability !== null && nextFixture?.cleanSheetProbability !== undefined) {
        forecastExplanation.factors.push("Fresh bookmaker clean-sheet probability included");
      }
    } else if (!isFpl && preferredProjectionEngine === "COMPONENT_XFP_V1") {
      const reason = nextFixture
        ? componentProjections.errorsByFixtureTeam.get(fixtureTeamProjectionKey(nextFixture.id, String(row.teamId)))
        : "No upcoming fixture";
      forecastExplanation.risks.unshift(`Component xFP unavailable; legacy fallback${reason ? `: ${reason}` : ""}`);
    }
    if (isFpl) {
      if (componentPredictedFp === null) {
        const reason = nextFixture
          ? componentProjections.errorsByFixtureTeam.get(fixtureTeamProjectionKey(nextFixture.id, String(row.teamId)))
          : "No upcoming fixture";
        forecastExplanation.risks.unshift(`FPL component forecast unavailable; no generic scoring fallback${reason ? `: ${reason}` : ""}`);
      }
      forecastExplanation.factors.unshift("FPL scoring adapter: official appearance, goals, assists, clean sheets, saves, cards, goals-conceded and defensive-contribution rules");
      if (recentFp.length > 0) forecastExplanation.factors.unshift("Recent FPL points are sourced from finalized official provider results");
      const adjustments = officialFplForecastAdjustmentsByPlayerId.get(String(row.playerId));
      if ((adjustments?.bonusCoverage ?? 0) > 0) {
        forecastExplanation.factors.unshift("Expected FPL bonus is the appearance-weighted rolling mean from finalized official FPL matches");
      } else {
        forecastExplanation.risks.unshift("FPL bonus forecast is zero until this player has finalized official FPL history; BPS is not converted directly into points");
      }
      if (positionGroup !== "GK" && (adjustments?.defensiveContributionCoverage ?? 0) > 0) {
        forecastExplanation.factors.unshift("Expected FPL defensive-contribution points use the official 10-CBIT/12-CBIRT threshold outcomes from finalized FPL matches");
      } else if (positionGroup !== "GK") {
        forecastExplanation.risks.unshift("FPL defensive-contribution forecast is zero until finalized official FPL threshold outcomes exist; generic recoveries never score directly");
      }
      forecastExplanation.risks.unshift("FPL penalty events and own goals are not forecast without official player-level event probabilities");
    }

    return [
      {
        id: playerId,
        playerId,
        teamId,
        name: playerName,
        fotmobName: row.player.name,
        teamName: row.team.name,
        projectedFixtureComponents: buildFixtureComponentInputs(
          nextComponentProjection,
          nextFixture
            ? componentProjections.formulaMetricsByFixturePlayer.get(fixturePlayerProjectionKey(nextFixture.id, playerId))
            : undefined
        ),
        teamShortName: roundsAndFixtures.teamShortNameById.get(teamId) ?? row.team.name,
        photoUrl: row.photoUrl ? playerPhotoPublicUrl(playerId) : null,
        leagueName: league.displayName,
        position,
        positionGroup,
        age: projected?.age ?? null,
        nationality: projected?.nationality ?? null,
        isStarter: isFpl && !starterStatusKnown ? undefined : row.isStarter ?? undefined,
        price: price.price,
        priceSource: price.priceSource,
        predictedFp,
        legacyPredictedFp,
        componentPredictedFp,
        projectionEngine,
        projectionComponents: isFpl ? null : nextComponentRoundComponents,
        fplForecastBreakdown: nextFplForecast?.breakdown ?? null,
        fplForecastStatus: nextFplForecast?.status ?? null,
        projectionFormula: !isFpl && projectionEngine === "COMPONENT_XFP_V1" ? nextComponentRoundFormula : null,
        alternativeProjectedFixtureComponents: buildFixtureComponentInputs(
          nextFriendProjection,
          nextFixture
            ? friendAlternativeProjections.formulaMetricsByFixturePlayer.get(fixturePlayerProjectionKey(nextFixture.id, playerId))
            : undefined
        ),
        alternativeProjectionComponents: isFpl ? null : nextFriendRoundComponents,
        alternativeFplForecastBreakdown: nextFplAlternativeForecast?.breakdown ?? null,
        alternativeProjectionFormula: nextFriendRoundFormula,
        alternativePredictedFp,
        alternativeRoundPoints,
        ...formulaAdaptations,
        foontasyPoints: foontasy?.points ?? null,
        // Foontasy publishes its current round only. Do not invent a T3/T5
        // total from one matchweek; this becomes numeric only when the source
        // supplies projections for every round in the selected horizon.
        foontasyHorizonPoints: null,
        foontasyFetchedAt: foontasy?.fetchedAt.toISOString() ?? null,
        modelT3Points: modelT3?.points ?? null,
        modelT5Points: modelT5?.points ?? null,
        modelT3Status: modelT3?.status ?? null,
        modelT5Status: modelT5?.status ?? null,
        modelForecastCalculatedAt: (modelT5?.calculatedAt ?? modelT3?.calculatedAt)?.toISOString() ?? null,
        expectedMinutes: nextComponentProjection?.expectedMinutes ?? projected?.expectedMinutes ?? null,
        startProbability: nextComponentProjection?.probabilities.appearance ?? null,
        forecastConfidence: projected?.forecastConfidence ?? null,
        forecastFactors: forecastExplanation.factors,
        forecastRisks: forecastExplanation.risks,
        forecastCalculatedAt: playerRows.calculatedAt,
        forecastDataUpdatedAt: projected?.dataUpdatedAt?.toISOString() ?? null,
        forecastModelVersion: isFpl
          ? "FPL_2026_27_OFFICIAL_SCORING_V2"
          : projectionEngine === "COMPONENT_XFP_V1" ? "COMPONENT_XFP_V1" : playerRows.modelVersion,
        recentFp,
        historicalStats: numericHistoricalStats({
          ...(projected?.rawMetrics ?? {}),
          average_rating: projected?.averageRating10 ?? projected?.averageRating ?? null
        }),
        valueScore: price.price > 0 ? roundFantasyValue((roundPoints[0] ?? predictedFp ?? 0) / price.price) : 0,
        roundPoints,
        roundFixtureCounts,
        fixtures,
        fixtureFullNames,
        fixtureDifficulties,
        baltikaXg: baltikaMetric?.xg ?? null,
        baltikaXa: baltikaMetric?.xa ?? null,
        baltikaMatchesPlayed: baltikaMetric?.matchesPlayed ?? null,
        baltikaTeamName: baltikaMetric?.teamName ?? null
      }
    ];
  });

  const basePlayers = isFpl
    ? rosterPlayers.filter((player) => player.priceSource === FPL_PROVIDER)
    : sportsRuPricedFantasyPlayers(rosterPlayers);
  const sportsRuPrices = !isFpl && options?.playerIds !== undefined
    ? new Set(priceMaps.map((row) => row.internalEntityId).filter((playerId): playerId is string => Boolean(playerId))).size
    : !isFpl ? basePlayers.filter((player) => player.priceSource === "SPORTS_RU").length : 0;
  const fplPrices = isFpl
    ? basePlayers.filter((player) => player.priceSource === FPL_PROVIDER).length
    : 0;
  const estimatedPrices = Math.max(0, rosterPlayerCount - sportsRuPrices - fplPrices);
  const latestPriceSync = priceRows.reduce<Date | null>((latest, row) => {
    if (!latest || row.lastSeenAt > latest) return row.lastSeenAt;
    return latest;
  }, null);
  const placeholderPlayers = fantasyProviderPlaceholdersFromFilters(savedSquad?.filters, provider).map((placeholder) =>
    fantasyProviderPlaceholderPlannerPlayer(placeholder, league.displayName, roundsAndFixtures.rounds.length || 5)
  );
  const players = mergeFantasyPlannerPlayerPools(basePlayers, placeholderPlayers);
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const horizonRounds = normalizeFantasyHorizon(savedSquad?.horizonRounds, rules.horizonOptions);
  const savedSelections =
    savedSquad?.players.flatMap((player): FantasySquadSelection[] => {
      const playerId = String(player.playerId);
      if (!playersById.has(playerId)) return [];
      return [{
        playerId,
        isStarter: player.isStarter,
        isLocked: player.isLocked,
        isCaptain: player.isCaptain,
        isViceCaptain: player.isViceCaptain,
        slotIndex: player.slotIndex,
        purchasePrice: playersById.get(playerId)?.price ?? player.purchasePrice
      }];
    }) ?? [];
  const storedRoundPlans = fantasySquadRoundPlansFromFilters(savedSquad?.filters, savedSelections, playersById);
  const roundShift = fantasySquadRoundShift(
    fantasySquadRoundIdsFromFilters(savedSquad?.filters),
    roundsAndFixtures.rounds.map((round) => round.id)
  );
  const roundPlans = rolloverFantasySquadRoundPlans({
    plans: storedRoundPlans,
    shift: roundShift,
    fallbackSelections: savedSelections,
    pool: players,
    rules
  });
  const currentSelections = roundPlans[0]?.selections ?? savedSelections;

  return {
    provider,
    contestId: scopedContest?.id ?? null,
    readiness,
    rules,
    rounds: roundsAndFixtures.rounds,
    bookmakerFavorites: buildBookmakerFavorites(roundsAndFixtures),
    players: players.sort(compareFantasyPlannerPlayers),
    squads: savedSquads.map((squad) => ({
      id: squad.id,
      name: squad.name,
      playersCount: savedFantasySquadPlayersCount(squad.players.length, squad.filters),
      updatedAt: squad.updatedAt.toISOString()
    })),
    squad: {
      id: savedSquad?.id ?? null,
      name: savedSquad?.name ?? "My squad",
      leagueId: String(league.leagueId),
      season: league.season,
      horizonRounds,
      selections: currentSelections,
      roundPlans
    },
    priceStatus: {
      sportsRuPrices,
      fplPrices,
      estimatedPrices,
      lastSyncedAt: latestPriceSync?.toISOString() ?? null
    },
    historySeasonOptions: history.availableSeasons,
    formulaAdaptationBreakdownsByPlayerId
  };
}

async function loadLatestFoontasyForecastRevision(prisma: PrismaClient, league: SharedLeagueSeasonOption) {
  const latest = await prisma.foontasyForecast.aggregate({
    where: {
      leagueId: league.leagueId,
      season: league.season,
      sourceVariant: "sports"
    },
    _max: { fetchedAt: true }
  });
  return latest._max.fetchedAt?.toISOString() ?? "no-foontasy";
}

export function buildFplRecentOfficialPoints(
  rows: ReadonlyArray<{ playerId: bigint | null; gameweek: number; points: number; status: string }>,
  limit = 5
) {
  const pointsByPlayerId = new Map<string, number[]>();
  for (const row of rows) {
    if (row.status !== "OFFICIAL" || !row.playerId || !Number.isFinite(row.points)) continue;
    const key = String(row.playerId);
    const points = pointsByPlayerId.get(key) ?? [];
    if (points.length < limit) points.push(row.points);
    pointsByPlayerId.set(key, points);
  }
  return pointsByPlayerId;
}

async function loadLatestFplOfficialScoreRevision(prisma: PrismaClient, contestId: string) {
  const latest = await prisma.fantasyProviderPlayerMatchScore.aggregate({
    where: { contestId, provider: FPL_PROVIDER, status: "OFFICIAL" },
    _max: { fetchedAt: true }
  });
  return latest._max.fetchedAt?.toISOString() ?? "no-fpl-official-scores";
}

type FplOfficialForecastHistoryRow = {
  playerId: bigint | null;
  gameweek: number;
  points: number;
  breakdown?: unknown;
  status: string;
};

type FplOfficialAppearanceSample = {
  bonus: number;
  /** Raw contribution count, retained only for legacy aggregate rows. */
  defensiveContribution: number | null;
  /** Official awarded points from a per-fixture explanation row. */
  defensiveContributionPoints: number | null;
};

/**
 * Builds leakage-safe forecast adjustments from finalized official FPL rows.
 * Per-fixture explanation values take precedence, so double gameweeks remain
 * separate samples; older aggregate-only rows retain a conservative fallback.
 * Bonus is a match-level rank award, so it is learned from the official bonus
 * outcome rather than reconstructed from incomplete third-party BPS inputs.
 * For current per-fixture rows, both bonus and defensive-contribution points
 * come from the official awarded-points explanation. A missing scoring
 * identifier means zero awarded points for that fixture, not missing data.
 * Legacy aggregate rows convert the official raw contribution count using
 * the position-specific 10-CBIT/12-CBIRT threshold. Generic ball recoveries
 * are deliberately ignored in both paths.
 */
export function buildFplOfficialForecastAdjustments(
  rows: ReadonlyArray<FplOfficialForecastHistoryRow>,
  positionsByPlayerId: ReadonlyMap<string, Exclude<FantasyPositionGroup, "UNK">>,
  limit = 5
) {
  const historyLimit = Math.max(1, Math.floor(limit));
  const historyByPlayerId = new Map<string, FplOfficialAppearanceSample[]>();
  for (const row of rows) {
    if (row.status !== "OFFICIAL" || !row.playerId) continue;
    const breakdown = numericRecord(row.breakdown);
    if (!breakdown) continue;
    const key = String(row.playerId);
    const history = historyByPlayerId.get(key) ?? [];
    for (const sample of fplOfficialAppearanceSamples(breakdown)) {
      if (history.length >= historyLimit) break;
      history.push(sample);
    }
    historyByPlayerId.set(key, history);
  }

  const adjustmentsByPlayerId = new Map<string, FplForecastAdjustments>();
  for (const [playerId, history] of historyByPlayerId) {
    const position = positionsByPlayerId.get(playerId);
    const defensiveRule = position === "DEF" || position === "MID" || position === "FWD"
      ? fpl202627Rules.scoring.defensiveContributions[position]
      : null;
    const defensiveRows = defensiveRule
      ? history.filter((row) => row.defensiveContributionPoints !== null || row.defensiveContribution !== null)
      : [];
    adjustmentsByPlayerId.set(playerId, {
      expectedBonusPerAppearance: averageKnown(history.map((row) => row.bonus)),
      expectedDefensiveContributionPointsPerAppearance: defensiveRule ? averageKnown(defensiveRows.map((row) =>
        row.defensiveContributionPoints
          ?? ((row.defensiveContribution ?? 0) >= defensiveRule.threshold ? defensiveRule.points : 0)
      )) : null,
      bonusCoverage: history.length / historyLimit,
      defensiveContributionCoverage: defensiveRule ? defensiveRows.length / historyLimit : position === "GK" ? 1 : 0
    });
  }
  return adjustmentsByPlayerId;
}

function emptyFormulaAdaptationForecasts() {
  return {
    foPositionCalibratedFp: null,
    altPositionCalibratedFp: null,
    altJointAllFp: null,
    foJointAllFp: null,
    altJointAcceptedFp: null,
    foJointAcceptedFp: null
  };
}

function fplOfficialAppearanceSamples(breakdown: Record<string, unknown>): FplOfficialAppearanceSample[] {
  const fixtureBreakdowns = Array.isArray(breakdown.fixture_breakdowns)
    ? breakdown.fixture_breakdowns.flatMap((value) => {
        const fixture = numericRecord(value);
        const stats = numericRecord(fixture?.stats);
        if (!stats) return [];
        const minutes = fplFixtureStatValue(stats.minutes);
        if (minutes === null || minutes <= 0) return [];
        return [{
          bonus: clamp(fplFixtureStatPoints(stats.bonus) ?? 0, 0, fpl202627Rules.scoring.bonus.max),
          defensiveContribution: null,
          defensiveContributionPoints: clamp(
            fplFixtureStatPoints(stats.defensive_contribution) ?? 0,
            0,
            fpl202627Rules.scoring.defensiveContributions.DEF.points
          )
        }];
      })
    : [];
  if (fixtureBreakdowns.length > 0) return fixtureBreakdowns;

  const minutes = finiteNumber(breakdown.minutes);
  const bonus = finiteNumber(breakdown.bonus);
  if (minutes === null || minutes <= 0 || bonus === null) return [];
  return [{
    bonus: clamp(bonus, 0, fpl202627Rules.scoring.bonus.max),
    defensiveContribution: finiteNumber(breakdown.defensive_contribution),
    defensiveContributionPoints: null
  }];
}

function fplFixtureStatValue(value: unknown) {
  const stat = numericRecord(value);
  return finiteNumber(stat?.value);
}

function fplFixtureStatPoints(value: unknown) {
  const stat = numericRecord(value);
  return finiteNumber(stat?.points);
}

function numericRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function loadFantasySquadFormulaAdaptationBreakdowns(
  prisma: PrismaClient,
  userId: string,
  league: SharedLeagueSeasonOption,
  playerId: bigint,
  historySettings: FantasyHistorySettings = defaultFantasyHistorySettings,
  provider = "SPORTS_RU"
) {
  // These Ridge adaptations were trained against generic/Sports.ru fantasy
  // points. Returning them in FPL would reintroduce the wrong scoring target.
  if (provider === FPL_PROVIDER) return null;
  const [preference, latestStartingXiChange, foontasyRevision, contest] = await Promise.all([
    prisma.userScoringPreference.findUnique({
      where: { userId_modelSource: { userId, modelSource: "MACHETE" } },
      select: { id: true, updatedAt: true }
    }),
    prisma.leagueSeasonTeam.aggregate({
      where: { leagueId: league.leagueId, season: league.season, active: true },
      _max: { startingXiChangedAt: true }
    }),
    loadLatestFoontasyForecastRevision(prisma, league),
    fantasyContestClient(prisma).findFirst({
      where: {
        provider,
        leagueId: league.leagueId,
        season: provider === FPL_PROVIDER ? FPL_SEASON : { in: sportsRuSeasonAliases(league.season) }
      },
      orderBy: { lastSyncedAt: "desc" },
      select: { id: true, lastSyncedAt: true, scheduleRevision: true }
    })
  ]);
  const preferenceRevision = preference ? `${preference.id}:${preference.updatedAt.toISOString()}` : "global";
  const startingXiRevision = latestStartingXiChange._max.startingXiChangedAt?.toISOString() ?? "no-xi-change";
  const key = formulaAdaptationBreakdownCacheKey({
    leagueId: league.leagueId,
    season: league.season,
    leagueUpdatedAt: league.updatedAt,
    provider,
    contestId: contest?.id ?? null,
    contestRevision: contest ? `${contest.lastSyncedAt?.toISOString() ?? "never"}:${contest.scheduleRevision ?? "no-schedule"}` : "no-contest-revision",
    playerId,
    userId,
    preferenceRevision,
    startingXiRevision,
    foontasyRevision,
    historySettingsKey: fantasyHistorySettingsKey(historySettings)
  });
  return fantasyFormulaAdaptationBreakdownCache.getOrCreate(key, fantasyPlayerPoolCacheTtlMs, async () => {
    const data = await loadFantasySquadPlannerData(prisma, userId, league, null, {
      playerIds: [playerId],
      historySettings,
      skipSavedSquads: true,
      includeFormulaAdaptationBreakdowns: true,
      provider,
      contestId: contest?.id ?? null
    });
    return data.formulaAdaptationBreakdownsByPlayerId[String(playerId)] ?? null;
  });
}

function numericHistoricalStats(metrics: Record<string, unknown> | undefined) {
  if (!metrics) return {};
  return Object.fromEntries(Object.entries(metrics).flatMap(([key, value]) =>
    typeof value === "number" && Number.isFinite(value) ? [[key, value]] : []
  ));
}

type FantasyContestDelegate = PrismaClient["fantasyContest"];

function fantasyContestClient(prisma: PrismaClient): FantasyContestDelegate {
  const candidate = prisma as unknown as {
    fantasyContest?: FantasyContestDelegate;
    sportsRuFantasyContest?: FantasyContestDelegate;
  };
  return candidate.fantasyContest ?? candidate.sportsRuFantasyContest ?? {
    findFirst: async () => null,
    findMany: async () => [],
    findUnique: async () => null
  } as unknown as FantasyContestDelegate;
}

async function ensureFantasyContest(
  tx: Prisma.TransactionClient,
  input: {
    contestId?: string | null;
    provider: string;
    leagueId: bigint;
    season: string;
    rules: FantasySquadRules;
  }
) {
  const delegate = (tx as unknown as { fantasyContest?: FantasyContestDelegate }).fantasyContest;
  if (!delegate) {
    return { id: input.contestId ?? `test-${input.provider}-${input.leagueId}-${input.season}` };
  }
  if (input.contestId) {
    const existing = await delegate.findUnique({ where: { id: input.contestId }, select: { id: true } });
    if (!existing) throw new Error("Fantasy contest does not exist for the selected provider and league season.");
    return existing;
  }
  if (input.provider === FPL_PROVIDER) {
    const existing = await delegate.findUnique({
      where: { provider_leagueId_season: { provider: FPL_PROVIDER, leagueId: input.leagueId, season: FPL_SEASON } },
      select: { id: true }
    });
    if (!existing) throw new Error("FPL contest is not synchronized yet.");
    return existing;
  }
  return delegate.upsert({
    where: {
      provider_leagueId_season: {
        provider: input.provider,
        leagueId: input.leagueId,
        season: input.season
      }
    },
    update: {
      budgetLimit: input.rules.budgetLimit,
      squadSize: input.rules.squadSize,
      maxPlayersPerTeam: input.rules.maxPlayersPerTeam
    },
    create: {
      provider: input.provider,
      leagueId: input.leagueId,
      season: input.season,
      name: `${input.provider} ${input.leagueId} ${input.season}`,
      budgetLimit: input.rules.budgetLimit,
      squadSize: input.rules.squadSize,
      maxPlayersPerTeam: input.rules.maxPlayersPerTeam
    },
    select: { id: true }
  });
}

export function fantasyPlayerPoolCacheKey(input: {
  provider: string;
  contestId?: string | null;
  leagueId: bigint;
  season: string;
  leagueUpdatedAt: Date;
  startingXiRevision: string;
  foontasyRevision: string;
  contestRevision: string;
  preferenceKey: string;
  historySettingsKey: string;
}) {
  return `${input.provider}:${input.contestId ?? "no-contest"}:${input.leagueId}:${input.season}:${input.leagueUpdatedAt.toISOString()}:${input.startingXiRevision}:${input.foontasyRevision}:${input.contestRevision}:${input.preferenceKey}:${input.historySettingsKey}`;
}

export function formulaAdaptationBreakdownCacheKey(input: {
  leagueId: bigint;
  season: string;
  leagueUpdatedAt: Date;
  provider: string;
  contestId?: string | null;
  contestRevision: string;
  playerId: bigint;
  userId: string;
  preferenceRevision: string;
  startingXiRevision: string;
  foontasyRevision: string;
  historySettingsKey: string;
}) {
  return [
    input.leagueId,
    input.season,
    input.leagueUpdatedAt.toISOString(),
    input.provider,
    input.contestId ?? "no-contest",
    input.contestRevision,
    input.playerId,
    input.userId,
    input.preferenceRevision,
    input.startingXiRevision,
    input.foontasyRevision,
    input.historySettingsKey
  ].join(":");
}

export function sportsRuPricedFantasyPlayers(players: FantasyPlannerPlayer[]) {
  return players.filter((player) => player.priceSource === "SPORTS_RU");
}

export function mergeFantasyPlannerPlayerPools(
  base: FantasyPlannerPlayer[],
  additions: FantasyPlannerPlayer[]
) {
  const merged = new Map(base.map((player) => [player.playerId, player]));
  for (const player of additions) merged.set(player.playerId, player);
  return [...merged.values()];
}

export function savedFantasySquadPlayersCount(fallbackCount: number, filters: unknown) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return fallbackCount;
  const plans = (filters as { roundPlans?: unknown }).roundPlans;
  if (!Array.isArray(plans)) return fallbackCount;
  const firstPlan = plans.find((plan) =>
    plan && typeof plan === "object" && !Array.isArray(plan) && Number((plan as { roundOffset?: unknown }).roundOffset) === 0
  );
  if (!firstPlan || typeof firstPlan !== "object" || Array.isArray(firstPlan)) return fallbackCount;
  const selections = (firstPlan as { selections?: unknown }).selections;
  if (!Array.isArray(selections)) return fallbackCount;
  return new Set(selections.flatMap((selection) => {
    if (!selection || typeof selection !== "object" || Array.isArray(selection)) return [];
    const playerId = (selection as { playerId?: unknown }).playerId;
    return typeof playerId === "string" && isFantasySquadPlayerId(playerId) ? [playerId] : [];
  })).size;
}

async function loadFplRosterPriceContext(
  prisma: PrismaClient,
  league: Pick<SharedLeagueSeasonOption, "leagueId" | "season">,
  contestId: string | null,
  requestedPlayerIds?: bigint[]
) {
  const priceRows = contestId
    ? await prisma.fantasyPlayerPrice.findMany({
        where: {
          contestId,
          provider: FPL_PROVIDER,
          leagueId: league.leagueId,
          season: FPL_SEASON,
          ...(requestedPlayerIds !== undefined ? { playerId: { in: requestedPlayerIds } } : {})
        },
        select: {
          id: true,
          playerId: true,
          teamId: true,
          playerName: true,
          normalizedName: true,
          teamName: true,
          position: true,
          positionLabel: true,
          sourceKind: true,
          sourceRowIndex: true,
          price: true,
          lastSeenAt: true
        },
        orderBy: { lastSeenAt: "desc" }
      })
    : [];
  return {
    priceRows,
    priceMaps: priceRows.map((row) => ({ providerEntityId: row.id, internalEntityId: row.playerId ? String(row.playerId) : null })),
    rosterOverrides: [] as SharedRosterOverride[]
  };
}

async function hasCompletedCoreLeagueMatch(prisma: PrismaClient, league: Pick<SharedLeagueSeasonOption, "leagueId" | "season">) {
  const completed = await prisma.coreMatch.findFirst({
    where: { leagueId: league.leagueId, season: league.season, finished: true, cancelled: false },
    select: { id: true }
  });
  return Boolean(completed);
}

async function loadBaltikaPlayerMetricsByName(prisma: PrismaClient, seasonNames: string[]) {
  const rows = await prisma.playerSnapshot.findMany({
    where: {
      teamImport: {
        status: ImportStatus.PUBLISHED,
        isCurrentPublished: true
      },
      season: {
        name: { in: seasonNames }
      }
    },
    select: {
      normalizedName: true,
      playerName: true,
      teamName: true,
      xg: true,
      xa: true,
      matchesPlayed: true,
      minutesPlayed: true
    },
    orderBy: [{ minutesPlayed: "desc" }, { playerName: "asc" }]
  });

  const grouped = new Map<string, BaltikaPlayerMetric[]>();
  for (const row of rows) {
    const key = row.normalizedName || normalizeSportsRuPlayerName(row.playerName);
    if (!key) continue;
    const metrics = grouped.get(key) ?? [];
    metrics.push({
      xg: row.xg,
      xa: row.xa,
      matchesPlayed: row.matchesPlayed,
      minutesPlayed: row.minutesPlayed,
      teamName: row.teamName
    });
    grouped.set(key, metrics);
  }

  const unique = new Map<string, BaltikaPlayerMetric>();
  for (const [key, metrics] of grouped) {
    const teams = new Set(metrics.map((metric) => metric.teamName));
    if (metrics.length > 1 && teams.size > 1) continue;
    unique.set(key, metrics[0]);
  }

  return unique;
}

export async function saveFantasySquad(
  prisma: PrismaClient,
  input: {
    userId: string;
    leagueId: bigint;
    season: string;
    squadId?: string | null;
    name?: string;
    horizonRounds: number;
    selections: FantasySquadSelection[];
    roundPlans?: FantasySquadRoundPlan[];
    roundPlanRoundIds?: string[];
    rules: FantasySquadRules;
    provider?: string;
    contestId?: string | null;
    providerPlaceholders?: FantasyProviderPlaceholder[];
  }
) {
  const horizonRounds = normalizeFantasyHorizon(input.horizonRounds, input.rules.horizonOptions);
  const name = normalizeFantasySquadName(input.name);
  return prisma.$transaction(async (tx) => {
    const provider = input.provider ?? "SPORTS_RU";
    const providerPlaceholders = parseFantasyProviderPlaceholders(input.providerPlaceholders, provider);
    const placeholdersById = new Map(providerPlaceholders.map((placeholder) => [placeholder.playerId, placeholder]));
    const selectionIds = new Set(input.selections.map((selection) => selection.playerId));
    if (selectionIds.size !== input.selections.length || input.selections.some((selection) =>
      !/^\d+$/.test(selection.playerId) && !placeholdersById.has(selection.playerId)
    )) {
      throw new Error("Fantasy squad contains an invalid provider placeholder.");
    }
    const canonicalSelections = input.selections.filter((selection) => !isFantasyProviderPlaceholderPlayerId(selection.playerId));
    const roundPlans = (input.roundPlans ?? createFantasySquadRoundPlans(input.selections)).map((plan) => ({
      ...plan,
      selections: plan.selections.map((selection) => {
        const placeholder = placeholdersById.get(selection.playerId);
        return placeholder ? { ...selection, purchasePrice: placeholder.price } : selection;
      })
    }));
    if (roundPlans.some((plan) => plan.selections.some((selection) =>
      !/^\d+$/.test(selection.playerId) && !placeholdersById.has(selection.playerId)
    ))) {
      throw new Error("Fantasy squad round plan contains an invalid provider placeholder.");
    }
    const usedPlaceholderIds = new Set(
      roundPlans.flatMap((plan) => plan.selections.map((selection) => selection.playerId))
        .filter(isFantasyProviderPlaceholderPlayerId)
    );
    const storedProviderPlaceholders = providerPlaceholders.filter((placeholder) => usedPlaceholderIds.has(placeholder.playerId));
    const contest = await ensureFantasyContest(tx, {
      contestId: input.contestId,
      provider,
      leagueId: input.leagueId,
      season: input.season,
      rules: input.rules
    });
    const selectedPlayerIds = [...new Set(canonicalSelections.map((selection) => selection.playerId))].map(BigInt);
    const sportsSeasons = sportsRuSeasonAliases(input.season);
    const [fotmobRosterRows, sportsRosterRows, fplPriceRows, sportsPositionsByPlayerId] = await Promise.all([
      provider === FPL_PROVIDER || selectedPlayerIds.length === 0
        ? Promise.resolve([] as Array<{ playerId: bigint; teamId: bigint; position: string | null }>)
        : tx.$queryRaw<Array<{ playerId: bigint; teamId: bigint; position: string | null }>>(Prisma.sql`
          SELECT
            "player_id" AS "playerId",
            "team_id" AS "teamId",
            "position"
          FROM "team_player_seasons"
          WHERE "league_id" = ${input.leagueId}
            AND "season" = ${input.season}
            AND "player_id" IN (${Prisma.join(selectedPlayerIds)})
            AND "active" = TRUE
          FOR SHARE
        `),
      provider === FPL_PROVIDER || selectedPlayerIds.length === 0
        ? Promise.resolve([] as Array<{ playerId: bigint; teamId: bigint; position: string | null }>)
        : tx.$queryRaw<Array<{ playerId: bigint; teamId: bigint; position: string | null }>>(Prisma.sql`
          SELECT
            prices."player_id" AS "playerId",
            prices."team_id" AS "teamId",
            prices."position"
          FROM "fantasy_player_prices" prices
          INNER JOIN "league_season_teams" season_team
            ON season_team."league_id" = ${input.leagueId}
            AND season_team."season" = ${input.season}
            AND season_team."team_id" = prices."team_id"
            AND season_team."active" = TRUE
          WHERE prices."provider" = 'SPORTS_RU'
            AND prices."contest_id" = ${contest.id}
            AND prices."league_id" = ${input.leagueId}
            AND prices."season" IN (${Prisma.join(sportsSeasons)})
            AND prices."player_id" IN (${Prisma.join(selectedPlayerIds)})
            AND prices."team_id" IS NOT NULL
          ORDER BY prices."last_seen_at" DESC
          FOR SHARE OF prices, season_team
        `),
      provider === FPL_PROVIDER
        ? tx.fantasyPlayerPrice.findMany({
            where: { contestId: contest.id, provider: FPL_PROVIDER, playerId: { in: selectedPlayerIds } },
            select: { playerId: true, teamId: true, position: true, price: true },
            orderBy: { lastSeenAt: "desc" }
          })
        : Promise.resolve([] as Array<{ playerId: bigint | null; teamId: bigint | null; position: string | null; price: number }>),
      provider === FPL_PROVIDER
        ? Promise.resolve(new Map<string, string>())
        : loadSportsRuFantasyPositionsByPlayerId(tx, {
            leagueId: input.leagueId,
            season: input.season,
            contestId: contest.id
          })
    ]);
    const fplRosterByPlayerId = new Map(
      fplPriceRows
        .filter((row) => row.playerId && row.teamId)
        .map((row) => [String(row.playerId), { playerId: row.playerId!, teamId: row.teamId!, position: row.position }] as const)
    );
    const rosterByPlayerId = provider === FPL_PROVIDER
      ? fplRosterByPlayerId
      : authoritativeFantasyRosterByPlayerId(fotmobRosterRows, sportsRosterRows);
    if (selectedPlayerIds.length !== canonicalSelections.length || rosterByPlayerId.size !== selectedPlayerIds.length) {
      throw new Error("Fantasy squad contains a player who is no longer active in the selected league and season.");
    }
    const positionByPlayerId = new Map(
      canonicalSelections.map((selection) => [
        selection.playerId,
        (provider === FPL_PROVIDER
          ? fplPriceRows.find((row) => String(row.playerId) === selection.playerId)?.position
          : sportsPositionsByPlayerId.get(selection.playerId))
        ?? rosterByPlayerId.get(selection.playerId)?.position
        ?? null
      ])
    );
    if (canonicalSelections.some((selection) => normalizeFantasyPosition(positionByPlayerId.get(selection.playerId)) === "UNK")) {
      throw new Error("Fantasy squad contains a player without an authoritative fantasy position.");
    }
    const resolvedPool = input.selections.map((selection) => {
      const placeholder = placeholdersById.get(selection.playerId);
      if (placeholder) {
        return fantasyProviderPlaceholderPlannerPlayer(placeholder, String(input.leagueId), horizonRounds);
      }
      const position = positionByPlayerId.get(selection.playerId)!;
      const teamId = String(rosterByPlayerId.get(selection.playerId)!.teamId);
      return {
        id: selection.playerId,
        playerId: selection.playerId,
        teamId,
        name: `Player ${selection.playerId}`,
        teamName: `Team ${teamId}`,
        leagueName: String(input.leagueId),
        position,
        positionGroup: normalizeFantasyPosition(position),
        price: selection.purchasePrice ?? 0,
        priceSource: provider === FPL_PROVIDER ? "FPL" as const : "ESTIMATED" as const,
        predictedFp: null,
        valueScore: 0,
        roundPoints: [],
        fixtures: [],
        fixtureDifficulties: []
      };
    });
    const resolvedSummary = summarizeFantasySquad(resolvedPool, input.selections, input.rules, horizonRounds);
    if (resolvedSummary.violations.length > 0) {
      throw new Error(`Fantasy squad changed during save: ${resolvedSummary.violations[0]}`);
    }
    const bank = resolvedSummary.bank;
    let squad: { id: string; name: string };
    if (input.squadId) {
      const ownedSquad = await tx.userFantasySquad.findFirst({
        where: {
          id: input.squadId,
          userId: input.userId,
          provider,
          contestId: contest.id,
          leagueId: input.leagueId,
          season: input.season
        },
        select: { id: true }
      });
      if (!ownedSquad) throw new Error("Fantasy squad does not belong to the selected user, league, and season.");
      squad = await tx.userFantasySquad.update({
        where: { id: ownedSquad.id },
        data: {
          name,
          budgetLimit: input.rules.budgetLimit,
          bank,
          horizonRounds,
          filters: {
            roundPlans,
            providerPlaceholders: storedProviderPlaceholders,
            roundPlanRoundIds: normalizeFantasySquadRoundIds(input.roundPlanRoundIds)
          }
        },
        select: { id: true, name: true }
      });
    } else {
      squad = await tx.userFantasySquad.create({
        data: {
          userId: input.userId,
          provider,
          contestId: contest.id,
          leagueId: input.leagueId,
          season: input.season,
          name,
          budgetLimit: input.rules.budgetLimit,
          bank,
          horizonRounds,
          filters: {
            roundPlans,
            providerPlaceholders: storedProviderPlaceholders,
            roundPlanRoundIds: normalizeFantasySquadRoundIds(input.roundPlanRoundIds)
          }
        },
        select: { id: true, name: true }
      });
    }

    await tx.userFantasySquadPlayer.deleteMany({ where: { squadId: squad.id } });
    await tx.userFantasySquadPlayer.createMany({
      data: input.selections.flatMap((selection, index) => {
        if (isFantasyProviderPlaceholderPlayerId(selection.playerId)) return [];
        return [{
          squadId: squad.id,
          playerId: BigInt(selection.playerId),
          teamId: rosterByPlayerId.get(selection.playerId)!.teamId,
          position: positionByPlayerId.get(selection.playerId)!,
          isStarter: selection.isStarter,
          isLocked: selection.isLocked,
          isCaptain: selection.isCaptain,
          isViceCaptain: selection.isViceCaptain,
          slotIndex: selection.slotIndex ?? index,
          purchasePrice: selection.purchasePrice
        }];
      })
    });

    return squad;
  });
}

export function authoritativeFantasyRosterByPlayerId<T extends {
  playerId: bigint;
  teamId: bigint;
  position: string | null;
}>(fotmobRows: T[], sportsRows: T[]) {
  const rosterByPlayerId = new Map(fotmobRows.map((row) => [String(row.playerId), row]));
  const sportsPlayerIds = new Set<string>();
  for (const row of sportsRows) {
    const playerId = String(row.playerId);
    if (sportsPlayerIds.has(playerId)) continue;
    sportsPlayerIds.add(playerId);
    rosterByPlayerId.set(playerId, row);
  }
  return rosterByPlayerId;
}

export function fantasySquadRoundPlansFromFilters(
  filters: unknown,
  fallbackSelections: FantasySquadSelection[],
  playersById?: ReadonlyMap<string, FantasyPlannerPlayer>
) {
  const fallback = createFantasySquadRoundPlans(fallbackSelections);
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return fallback;
  const rawPlans = (filters as { roundPlans?: unknown }).roundPlans;
  if (!Array.isArray(rawPlans)) return fallback;

  return fallback.map((fallbackPlan, roundOffset) => {
    const raw = rawPlans.find((item) => item && typeof item === "object" && !Array.isArray(item) && Number((item as { roundOffset?: unknown }).roundOffset) === roundOffset);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallbackPlan;
    const rawSelections = Array.isArray((raw as { selections?: unknown }).selections) ? (raw as { selections: unknown[] }).selections : [];
    const seen = new Set<string>();
    const selections = rawSelections.flatMap((item, index): FantasySquadSelection[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const playerId = typeof record.playerId === "string" && isFantasySquadPlayerId(record.playerId) ? record.playerId : null;
      if (!playerId || seen.has(playerId) || (playersById && !playersById.has(playerId))) return [];
      seen.add(playerId);
      const purchasePrice = Number(record.purchasePrice);
      return [{
        playerId,
        isStarter: record.isStarter !== false,
        isLocked: record.isLocked === true,
        isCaptain: record.isCaptain === true,
        isViceCaptain: record.isViceCaptain === true,
        slotIndex: Number.isInteger(Number(record.slotIndex)) ? Math.max(0, Number(record.slotIndex)) : index,
        purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null
      }];
    });
    return {
      roundOffset,
      linkedToPrevious: roundOffset > 0 && (raw as { linkedToPrevious?: unknown }).linkedToPrevious !== false,
      selections: selections.length > 0 || fallbackSelections.length === 0 ? selections : fallbackPlan.selections
    };
  });
}

export function fantasySquadRoundIdsFromFilters(filters: unknown) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return [];
  return normalizeFantasySquadRoundIds((filters as { roundPlanRoundIds?: unknown }).roundPlanRoundIds);
}

export function fantasySquadRoundShift(storedRoundIds: string[], currentRoundIds: string[]) {
  const currentRoundId = currentRoundIds[0];
  if (!currentRoundId || storedRoundIds.length === 0 || storedRoundIds[0] === currentRoundId) return 0;

  const exactIndex = storedRoundIds.indexOf(currentRoundId);
  if (exactIndex > 0) return exactIndex;

  const storedRoundNumber = fantasyRoundNumber(storedRoundIds[0]);
  const currentRoundNumber = fantasyRoundNumber(currentRoundId);
  if (storedRoundNumber === null || currentRoundNumber === null || currentRoundNumber <= storedRoundNumber) return 0;
  return currentRoundNumber - storedRoundNumber;
}

export function rolloverFantasySquadRoundPlans(input: {
  plans: FantasySquadRoundPlan[];
  shift: number;
  fallbackSelections: FantasySquadSelection[];
  pool: FantasyPlannerPlayer[];
  rules: FantasySquadRules;
}) {
  const plans = input.plans.length > 0 ? input.plans : createFantasySquadRoundPlans(input.fallbackSelections);
  const shift = Math.max(0, Math.floor(input.shift));
  if (shift === 0) return plans.map(cloneFantasySquadRoundPlan);

  const validate = (selections: FantasySquadSelection[]) =>
    validateFantasySquadForSave({ pool: input.pool, selections, rules: input.rules, horizon: 1 });
  const preferredStartIndex = Math.min(shift, plans.length - 1);
  const startCandidates = [
    ...plans.slice(0, preferredStartIndex + 1).reverse(),
    ...plans.slice(preferredStartIndex + 1),
    { roundOffset: 0, linkedToPrevious: false, selections: input.fallbackSelections }
  ];
  const validStart = startCandidates
    .map((plan) => validate(plan.selections))
    .find((result) => result.ok);
  const startSelections = validStart?.ok ? validStart.selections : [];
  const rolled = createFantasySquadRoundPlans(startSelections);
  const perRoundTransferLimit = fantasyTransferLimitForHorizon(1, input.rules.transferLimitPerRound);

  for (let roundOffset = 1; roundOffset < rolled.length; roundOffset += 1) {
    const sourceIndex = roundOffset + shift;
    if (sourceIndex >= plans.length) {
      rolled[roundOffset].selections = rolled[roundOffset - 1].selections.map((selection) => ({ ...selection }));
      continue;
    }

    const sourcePlan = plans[sourceIndex];
    const validated = validate(sourcePlan.selections);
    const previousSelections = rolled[roundOffset - 1].selections;
    if (!validated.ok || countFantasySquadTransfers(previousSelections, validated.selections) > perRoundTransferLimit) {
      rolled[roundOffset].selections = previousSelections.map((selection) => ({ ...selection }));
      rolled[roundOffset].linkedToPrevious = true;
      continue;
    }

    rolled[roundOffset] = {
      roundOffset,
      linkedToPrevious: sourcePlan.linkedToPrevious,
      selections: validated.selections.map((selection) => ({ ...selection }))
    };
  }

  return rolled;
}

function normalizeFantasySquadRoundIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 128))
    .slice(0, 5);
}

function fantasyRoundNumber(roundId: string) {
  const match = roundId.match(/^(?:round:|fpl:event:|sports-ru:tour:|[a-z0-9-]+:round:)(\d+)(?::|$)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function cloneFantasySquadRoundPlan(plan: FantasySquadRoundPlan): FantasySquadRoundPlan {
  return {
    ...plan,
    selections: plan.selections.map((selection) => ({ ...selection }))
  };
}

export function normalizeFantasySquadName(value: string | null | undefined, fallback = "My squad") {
  const normalized = value?.replace(/\s+/g, " ").trim() || fallback;
  return normalized.slice(0, maxFantasySquadNameLength).trim() || fallback;
}

export function uniqueFantasySquadName(existingNames: Iterable<string>, requestedName: string | null | undefined) {
  const baseName = normalizeFantasySquadName(requestedName);
  const used = new Set([...existingNames].map((name) => normalizeFantasySquadName(name).toLocaleLowerCase()));
  if (!used.has(baseName.toLocaleLowerCase())) return baseName;

  for (let index = 2; index < 10_000; index += 1) {
    const suffix = ` (${index})`;
    const stem = baseName.slice(0, Math.max(1, maxFantasySquadNameLength - suffix.length)).trimEnd();
    const candidate = `${stem}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }

  return `${baseName.slice(0, maxFantasySquadNameLength - 14)} ${Date.now()}`;
}

export function fantasyRulesForLeague(
  league: SharedLeagueSeasonOption,
  contest: {
    budgetLimit: number;
    squadSize: number;
    maxPlayersPerTeam: number;
    name: string;
  } | null,
  provider = "SPORTS_RU"
): FantasySquadRules {
  if (provider === FPL_PROVIDER) {
    return {
      ...defaultFantasySquadRules,
      budgetLimit: fpl202627Rules.budgetLimit,
      squadSize: fpl202627Rules.squadSize,
      starterSize: fpl202627Rules.starterSize,
      benchSize: fpl202627Rules.squadSize - fpl202627Rules.starterSize,
      maxPlayersPerTeam: fpl202627Rules.maxPlayersPerTeam,
      transferLimitPerRound: null,
      positionLimits: { ...fpl202627Rules.positionLimits },
      starterPositionLimits: { ...fpl202627Rules.starterPositionLimits },
      sourceLabel: "FPL 2026/27 official rules",
      supportsBenchBoost: true,
      supportsTripleCaptain: true
    };
  }
  const inferredMaxPlayers = isTopFiveLeague(league) ? 3 : 2;
  return {
    ...defaultFantasySquadRules,
    budgetLimit: contest?.budgetLimit ?? 100,
    squadSize: contest?.squadSize ?? defaultFantasySquadRules.squadSize,
    maxPlayersPerTeam: contest?.maxPlayersPerTeam ?? inferredMaxPlayers,
    transferLimitPerRound: league.leagueId === 63n ? transfersPerFantasyRound : null,
    sourceLabel: contest ? `Sports.ru: ${contest.name}` : isTopFiveLeague(league) ? "Inferred top-five league rules" : "Inferred default Sports.ru rules"
  };
}

export function friendAlternativeScoringModel(
  baseModel: ActiveScoringModel,
  preference: UserScoringFormulaPreference | null | undefined
): ActiveScoringModel {
  const personalEnabled = Boolean(
    preference?.alternativeFormulaEnabled &&
    [
      preference.alternativeFormulaGk,
      preference.alternativeFormulaDef,
      preference.alternativeFormulaMid,
      preference.alternativeFormulaFwd
    ].some((formula) => formula?.trim())
  );
  const formula = (personal: string | null | undefined, fallback: string) =>
    personalEnabled ? personal?.trim() || fallback : fallback;

  return {
    ...baseModel,
    alternativeFormulaGk: formula(preference?.alternativeFormulaGk, friendAlternativeFormulaDefaults.alternativeFormulaGk),
    alternativeFormulaDef: formula(preference?.alternativeFormulaDef, friendAlternativeFormulaDefaults.alternativeFormulaDef),
    alternativeFormulaMid: formula(preference?.alternativeFormulaMid, friendAlternativeFormulaDefaults.alternativeFormulaMid),
    alternativeFormulaFwd: formula(preference?.alternativeFormulaFwd, friendAlternativeFormulaDefaults.alternativeFormulaFwd),
    alternativeFormulaEnabled: true
  };
}

export function resolvedExpectedProjectionConfig(model: ActiveScoringModel) {
  const parsed = parseProjectionFormulaConfig(model.projectionFormulaConfig, expectedProjectionFormulaConfig).config;
  if (model.projectionFormulaConfig || !model.customFormulaEnabled) return parsed;

  return {
    ...parsed,
    scoreByPosition: {
      GK: model.customFormulaGk?.trim() || model.customFormula?.trim() || parsed.scoreByPosition.GK,
      DEF: model.customFormulaDef?.trim() || model.customFormula?.trim() || parsed.scoreByPosition.DEF,
      MID: model.customFormulaMid?.trim() || model.customFormula?.trim() || parsed.scoreByPosition.MID,
      FWD: model.customFormulaFwd?.trim() || model.customFormula?.trim() || parsed.scoreByPosition.FWD
    }
  };
}

export function resolvedAlternativeProjectionConfig(preference: UserScoringFormulaPreference | null | undefined) {
  const parsed = parseProjectionFormulaConfig(
    preference?.alternativeProjectionFormulaConfig,
    friendAltProjectionFormulaConfig
  ).config;
  if (preference?.alternativeProjectionFormulaConfig || !preference?.alternativeFormulaEnabled) return parsed;

  return {
    ...parsed,
    scoreByPosition: {
      GK: preference.alternativeFormulaGk?.trim() || parsed.scoreByPosition.GK,
      DEF: preference.alternativeFormulaDef?.trim() || parsed.scoreByPosition.DEF,
      MID: preference.alternativeFormulaMid?.trim() || parsed.scoreByPosition.MID,
      FWD: preference.alternativeFormulaFwd?.trim() || parsed.scoreByPosition.FWD
    }
  };
}

async function loadProjectedPlayerRows(
  prisma: PrismaClient,
  userId: string,
  league: SharedLeagueSeasonOption,
  history: ResolvedFantasyHistory,
  playerIds?: bigint[],
  deferFormulaProjections = false,
  rosterOverrides: SharedRosterOverride[] = [],
  ignoreStarterFlags = false
) {
  const [modelBundle, preference] = await Promise.all([
    getActiveScoringModelBundleForSource("MACHETE", prisma),
    prisma.userScoringPreference.findUnique({ where: { userId_modelSource: { userId, modelSource: "MACHETE" } } })
  ]);
  const readTimeScoringModel = friendAlternativeScoringModel(modelBundle.model, preference);
  const expectedProjectionConfig = resolvedExpectedProjectionConfig(modelBundle.model);
  const alternativeProjectionConfig = resolvedAlternativeProjectionConfig(preference);
  const baseModelVersion = `${modelBundle.identity.configuredModelSource}:${modelBundle.identity.configuredModelId ?? "built-in"}:v${modelBundle.identity.configuredModelVersion}`;
  const [rawRows, rawFriendRows, calibration] = await Promise.all([
    loadSharedMachetePlayerRows(prisma, {
      scopes: history.historyScopes,
      rosterScopes: history.rosterScopes,
      matchWindow: history.matchWindow,
      combineTeamCompetitions: true,
      fallbackToRecentPlayerHistory: history.includePlayerHistory,
      fallbackToRecentClubHistory: true,
      scoringModel: modelBundle.model,
      playerIds,
      rosterOverrides,
      ignoreStarterFlags
    }),
    deferFormulaProjections
      ? Promise.resolve([])
      : loadSharedMachetePlayerRows(prisma, {
          scopes: history.projectionScopes,
          rosterScopes: history.rosterScopes,
          matchWindow: { kind: "days", days: 365 },
          combineTeamCompetitions: true,
          fallbackToRecentPlayerHistory: false,
          fallbackToRecentClubHistory: true,
          fallbackLeagueIds: [...new Set(history.projectionScopes.map((scope) => scope.leagueId))],
          scoringModel: modelBundle.model,
          rosterOverrides,
          ignoreStarterFlags
        }),
    loadFantasyProjectionCalibration(prisma, {
      leagueId: league.leagueId,
      currentSeason: league.season,
      scoringModel: modelBundle.model,
      modelCacheKey: `${baseModelVersion}:${modelBundle.identity.configuredModelUpdatedAt?.toISOString() ?? "built-in"}`
    })
  ]);
  const [rows, friendRows] = await Promise.all([
    addArchivedPlayerSeasonMetrics(prisma, rawRows, league),
    deferFormulaProjections
      ? Promise.resolve(rawFriendRows)
      : addArchivedPlayerSeasonMetrics(prisma, rawFriendRows, league)
  ]);

  return {
    calculatedAt: new Date().toISOString(),
    modelVersion: calibration
      ? `${baseModelVersion}+${FANTASY_PROJECTION_CALIBRATION.featureVersion}@${calibration.trainingSeason}`
      : `${baseModelVersion}+uncalibrated`,
    calibration,
    scoringModel: readTimeScoringModel,
    expectedProjectionConfig,
    alternativeProjectionConfig,
    friendRows: friendRows.map((row) => {
      const { teamId, playerId } = fantasyPlannerSharedRowIdentity(row.id);
      return { ...row, teamId, playerId };
    }),
    rows: rows.map((row) => {
      const { teamId, playerId } = fantasyPlannerSharedRowIdentity(row.id);
      return {
        ...row,
        teamId,
        playerId
      };
    })
  };
}

async function addArchivedPlayerSeasonMetrics(
  prisma: PrismaClient,
  rows: SharedMachetePlayerRow[],
  league: SharedLeagueSeasonOption
) {
  if (rows.length === 0) return rows;
  const identities = rows.map((row) => fantasyPlannerSharedRowIdentity(row.id));
  const playerIds = [...new Set(identities.map((identity) => identity.playerId))]
    .filter((value) => /^\d+$/.test(value))
    .map(BigInt);
  const [archives, currentStats, teamStatRows] = await Promise.all([
    prisma.playerSeasonArchive.findMany({
      where: {
        playerId: { in: playerIds },
        season: { not: league.season },
        aggregateScope: "LEAGUE"
      },
      orderBy: [{ season: "desc" }, { fetchedAt: "desc" }]
    }),
    prisma.matchPlayerStat.findMany({
      where: {
        playerId: { in: playerIds },
        match: { leagueId: league.leagueId, season: league.season }
      },
      select: { playerId: true, teamId: true, matchId: true, minutes: true, xg: true, xa: true }
    }),
    prisma.matchPlayerStat.findMany({
      where: {
        teamId: { in: [...new Set(identities.map((identity) => identity.teamId))].filter((value) => /^\d+$/.test(value)).map(BigInt) },
        match: { leagueId: league.leagueId, season: league.season }
      },
      select: { teamId: true, matchId: true }
    })
  ]);
  const archivesByPlayer = new Map<string, typeof archives>();
  for (const archive of archives) {
    const key = String(archive.playerId);
    const values = archivesByPlayer.get(key) ?? [];
    values.push(archive);
    archivesByPlayer.set(key, values);
  }
  const currentByPlayer = new Map<string, { minutes: number; xg: number; xa: number; appearances: Set<string> }>();
  for (const stat of currentStats) {
    const key = String(stat.playerId);
    const current = currentByPlayer.get(key) ?? { minutes: 0, xg: 0, xa: 0, appearances: new Set<string>() };
    current.minutes += Math.max(0, stat.minutes ?? 0);
    current.xg += Math.max(0, stat.xg ?? 0);
    current.xa += Math.max(0, stat.xa ?? 0);
    if ((stat.minutes ?? 0) > 0 || stat.xg !== null || stat.xa !== null) current.appearances.add(String(stat.matchId));
    currentByPlayer.set(key, current);
  }
  const statMatchesByTeam = new Map<string, Set<string>>();
  for (const stat of teamStatRows) {
    if (!stat.teamId) continue;
    const key = String(stat.teamId);
    const matches = statMatchesByTeam.get(key) ?? new Set<string>();
    matches.add(String(stat.matchId));
    statMatchesByTeam.set(key, matches);
  }

  return rows.map((row) => {
    const identity = fantasyPlannerSharedRowIdentity(row.id);
    const options = archivesByPlayer.get(identity.playerId) ?? [];
    const archive = preferredArchivedSeason(options, identity.teamId, league.leagueId);
    if (!archive || !archive.appearances || archive.appearances <= 0) return row;
    const current = currentByPlayer.get(identity.playerId);
    const feederLeagueId = teamStrengthFeederLeagueByTopLeague.get(String(league.leagueId));
    const tierFactor = feederLeagueId === archive.leagueId ? FEEDER_TO_TOP_EVENT_FACTOR : 1;
    return {
      ...row,
      rawMetrics: {
        ...(row.rawMetrics ?? {}),
        current_season_minutes: current?.minutes ?? 0,
        current_season_appearances: current?.appearances.size ?? 0,
        current_season_xg: current?.xg ?? 0,
        current_season_xa: current?.xa ?? 0,
        current_team_stat_matches: statMatchesByTeam.get(identity.teamId)?.size ?? 0,
        archive_prior_season: archive.season,
        archive_prior_league_id: Number(archive.leagueId),
        archive_prior_team_id: Number(archive.teamId),
        archive_prior_appearances: archive.appearances,
        archive_prior_minutes: archive.minutes,
        archive_prior_goals: archive.goals,
        archive_prior_assists: archive.assists,
        archive_prior_team_matches: archive.teamMatches,
        archive_prior_same_team: String(archive.teamId) === identity.teamId ? 1 : 0,
        archive_tier_factor: tierFactor
      }
    };
  });
}

export function preferredArchivedSeason<T extends {
  season: string;
  teamId: bigint;
  leagueId: bigint;
  appearances: number | null;
}>(options: T[], currentTeamId: string, currentLeagueId: bigint) {
  const latestSeason = options[0]?.season;
  if (!latestSeason) return null;
  const latest = options.filter((candidate) => candidate.season === latestSeason);
  const feederLeagueId = teamStrengthFeederLeagueByTopLeague.get(String(currentLeagueId));
  return (
    (feederLeagueId
      ? latest.find((candidate) => candidate.teamId === BigInt(currentTeamId) && candidate.leagueId === feederLeagueId)
      : null) ??
    (feederLeagueId ? latest.find((candidate) => candidate.leagueId === feederLeagueId) : null) ??
    latest.find((candidate) => candidate.teamId === BigInt(currentTeamId) && candidate.leagueId === currentLeagueId) ??
    latest.find((candidate) => candidate.leagueId === currentLeagueId) ??
    latest
      .filter((candidate) => String(candidate.teamId) === currentTeamId)
      .sort((left, right) => (right.appearances ?? 0) - (left.appearances ?? 0))[0] ??
    [...latest].sort((left, right) => (right.appearances ?? 0) - (left.appearances ?? 0))[0] ??
    null
  );
}

export function fantasyPlannerSharedRowIdentity(rowId: string) {
  const parts = rowId.split(":");
  return parts[0] === "combined"
    ? { teamId: parts[1] ?? "", playerId: parts[2] ?? "" }
    : { teamId: parts[2] ?? "", playerId: parts[3] ?? "" };
}

export function configuredFantasyProjectionEngine(envValue = process.env.FANTASY_PROJECTION_ENGINE): FantasyProjectionEngine {
  return envValue?.trim().toLowerCase() === "legacy" ? "LEGACY_RIDGE19_V1" : "COMPONENT_XFP_V1";
}

function buildComponentProjectionIndex(
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

type PipelineParticipant = {
  row: SharedMachetePlayerRow & { teamId: string; playerId: string };
  input: ProbableParticipantInput;
  metrics: Record<string, unknown>;
};

const starterPer90FullReliabilityMinutes = 450;
const starterPer90MinimumReliability = 0.25;
const completeTeamPlayerMinutes = 11 * 90;
const minimumSparseGuardRosterSize = 11;
const minimumMeaningfulAllocationPlayers = 7;
const meaningfulAllocationMinutes = 15;
const minimumTeamAllocationEventMinutes = 360;
const teamAttackAllocationReservePlayerId = "__team_attack_allocation_reserve__";
const standardAttackAllocationPositions = [
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

function rankPipelineCandidates(candidates: PipelineParticipant[]) {
  return candidates.sort((left, right) =>
    Number(right.metrics.roster_starter_marked) - Number(left.metrics.roster_starter_marked) ||
    right.input.probabilities.appearance! - left.input.probabilities.appearance! ||
    right.input.expectedMinutes! - left.input.expectedMinutes! ||
    right.row.minutesPlayed - left.row.minutesPlayed
  );
}

function emptyComponentProjectionIndex(): ComponentProjectionIndex {
  return {
    byFixturePlayer: new Map(),
    formulaMetricsByFixturePlayer: new Map(),
    errorsByFixtureTeam: new Map()
  };
}

function pipelineParticipant(
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

function blendStarterRoleRate(observedRate: number, positionPrior: number, roleReliability: number) {
  const reliability = clamp(roleReliability, 0, 1);
  return positionPrior + (Math.max(0, observedRate) - positionPrior) * reliability;
}

function blendedTransferRatePenalty(provenance: SharedMachetePlayerRow["minuteHistoryProvenance"]) {
  const previousMatches = provenance?.previousClubMatches ?? 0;
  if (previousMatches <= 0) return 1;
  const currentMatches = provenance?.currentClubMatches ?? 0;
  const previousPenalty = clamp(provenance?.previousClubPenaltyFactor ?? 1, 0, 1);
  return (currentMatches + previousMatches * previousPenalty) / Math.max(1, currentMatches + previousMatches);
}

function nearestFixtureIdsByTeam(fixtures: Iterable<PlannerFixture>) {
  const nearest = new Map<string, PlannerFixture>();
  for (const fixture of fixtures) {
    const current = nearest.get(fixture.teamId);
    if (!current || comparePlannerFixtures(fixture, current) < 0) nearest.set(fixture.teamId, fixture);
  }
  return new Map([...nearest].map(([teamId, fixture]) => [teamId, fixture.id]));
}

function nearestPlannerFixture(fixtures: PlannerFixture[]) {
  return fixtures.reduce<PlannerFixture | null>(
    (nearest, fixture) => !nearest || comparePlannerFixtures(fixture, nearest) < 0 ? fixture : nearest,
    null
  );
}

function comparePlannerFixtures(left: PlannerFixture, right: PlannerFixture) {
  const leftKickoff = left.kickoffAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightKickoff = right.kickoffAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftKickoff - rightKickoff || left.id.localeCompare(right.id);
}

export function countsAsFullFantasyMatch(expectedMinutes: number) {
  return Number.isFinite(expectedMinutes) && expectedMinutes >= 80;
}

function pipelineAllocationParticipant(
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

function applySparseHistoryAllocationFallbacks(
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

function applySparseTeamAttackAllocationGuard(
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

function allocationWeightTotal(
  participants: PipelineParticipant[],
  metric: "goals" | "assists"
) {
  return participants.reduce(
    (total, participant) => total + (participant.input.allocationWeights?.[metric] ?? 0),
    0
  );
}

function applyPositionAllocationFallback(
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

function pipelineTeamContext(
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

function pipelineTeamTotals(
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

function formulaValue(formula: string, metrics: Record<string, unknown>) {
  return calculateCustomFormulaScore(formula, metrics);
}

function nonNegativeFormulaValue(formula: string, metrics: Record<string, unknown>, path: string) {
  const value = formulaValue(formula, metrics);
  if (value < 0) throw new Error(`${path} must return a non-negative number, received ${value}`);
  return value;
}

function per90AwareAllocationValue(formula: string, metrics: Record<string, unknown>, path: string) {
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

function componentParticipant(
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

function componentTeamTotals(
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

function participantExposureFactor(player: ProbableParticipantInput) {
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

function componentMetric(row: Pick<SharedMachetePlayerRow, "rawMetrics">, key: string) {
  return numericOrNull(row.rawMetrics?.[key]) ?? 0;
}

function componentRatePer90(row: Pick<SharedMachetePlayerRow, "rawMetrics" | "minutesPlayed">, key: string) {
  if (row.minutesPlayed <= 0) return 0;
  return componentMetric(row, key) * 90 / row.minutesPlayed;
}

function inversePoissonOver15Probability(probabilityValue: number | null | undefined) {
  if (typeof probabilityValue !== "number" || !Number.isFinite(probabilityValue) || probabilityValue <= 0 || probabilityValue >= 1) return null;
  let low = 0;
  let high = 8;
  for (let index = 0; index < 60; index += 1) {
    const middle = (low + high) / 2;
    if ((poissonOver15Probability(middle) ?? 0) < probabilityValue) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function fixtureTeamProjectionKey(fixtureId: string, teamId: string) {
  return `${fixtureId}:${teamId}`;
}

function fixturePlayerProjectionKey(fixtureId: string, playerId: string) {
  return `${fixtureId}:${playerId}`;
}

export function fixtureFormulaMetrics(
  rawMetrics: Record<string, unknown> | undefined,
  fixture: PlannerFixture | null,
  now = new Date()
): Record<string, unknown> {
  const oddsAgeHours = fixture?.oddsFetchedAt
    ? Math.max(0, (now.getTime() - fixture.oddsFetchedAt.getTime()) / (60 * 60 * 1_000))
    : 0;
  const oddsAvailable = fixture?.teamOver15Probability !== null && fixture?.teamOver15Probability !== undefined &&
    fixture.cleanSheetProbability !== null && fixture.cleanSheetProbability !== undefined;

  return {
    ...(rawMetrics ?? {}),
    fixture_team_over_1_5_probability: fixture?.teamOver15Probability ?? 0,
    fixture_clean_sheet_probability: fixture?.cleanSheetProbability ?? 0,
    fixture_bookmaker_odds_available: oddsAvailable ? 1 : 0,
    fixture_bookmaker_odds_age_hours: oddsAvailable ? oddsAgeHours : 0,
    fixture_projected_xg: fixture?.projectedXg ?? 0,
    fixture_projected_xga: fixture?.projectedXga ?? 0,
    next_projected_xg: fixture?.projectedXg ?? 0,
    next_projected_xga: fixture?.projectedXga ?? 0,
    next_fixture_count: fixture ? 1 : 0,
    next_is_home: fixture?.side === "H" ? 1 : 0,
    next_is_away: fixture?.side === "A" ? 1 : 0
  };
}

export function componentProjectionFormulaMetrics(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  extraMetrics?: Record<string, unknown>
): Record<string, unknown> {
  const { components, expectedEvents, probabilities } = projection;

  return fixtureFormulaMetrics({
    ...(extraMetrics ?? {}),
    matches_played: 1,
    minutes_played: projection.expectedMinutes,
    appearance_probability: probabilities.appearance,
    sixty_minute_probability: probabilities.sixtyMinutes,
    full_match_probability: probabilities.fullMatch,
    xg: expectedEvents.goals,
    xa: expectedEvents.assists,
    recoveries: expectedEvents.recoveries,
    saves: expectedEvents.saves,
    goals_conceded: expectedEvents.goalsConceded,
    clean_sheets: expectedEvents.cleanSheets,
    yellow_cards: expectedEvents.yellowCards,
    red_cards: expectedEvents.redCards,
    expected_goals: expectedEvents.goals,
    expected_assists: expectedEvents.assists,
    expected_recoveries: expectedEvents.recoveries,
    expected_saves: expectedEvents.saves,
    expected_goals_conceded: expectedEvents.goalsConceded,
    expected_clean_sheets: expectedEvents.cleanSheets,
    expected_yellow_cards: expectedEvents.yellowCards,
    expected_red_cards: expectedEvents.redCards,
    appearance_fp: components.appearance,
    "60_minutes_fp": components.sixtyMinutes,
    full_match_fp: components.fullMatch,
    goal_fp: components.goals,
    assist_fp: components.assists,
    clean_sheet_fp: components.cleanSheet,
    save_fp: components.saves,
    recovery_fp: components.recoveries,
    goals_conceded_fp: components.goalsConceded,
    yellow_card_fp: components.yellowCards,
    red_card_fp: components.redCards
  }, fixture);
}

export function aggregatePlayerFantasyPointComponents(
  components: readonly PlayerFantasyPointComponents[]
): PlayerFantasyPointComponents | null {
  if (components.length === 0) return null;
  const keys = [
    "appearance",
    "sixtyMinutes",
    "fullMatch",
    "goals",
    "assists",
    "cleanSheet",
    "saves",
    "recoveries",
    "goalsConceded",
    "yellowCards",
    "redCards",
    "total"
  ] as const satisfies readonly (keyof PlayerFantasyPointComponents)[];
  return Object.fromEntries(keys.map((key) => [
    key,
    roundFantasyValue(components.reduce((total, component) => total + component[key], 0))
  ])) as PlayerFantasyPointComponents;
}

export function projectionFormulaFantasyPoints(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  config: ProjectionFormulaConfig,
  extraMetrics?: Record<string, unknown>
) {
  return roundFantasyValue(calculateCustomFormulaScore(
    config.scoreByPosition[projection.position],
    componentProjectionFormulaMetrics(projection, fixture, extraMetrics)
  ));
}

function projectionFormulaWithBreakdown(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  config: ProjectionFormulaConfig,
  extraMetrics?: Record<string, unknown>
) {
  const formula = config.scoreByPosition[projection.position];
  const breakdown = calculateCustomFormulaScoreWithBreakdown(
    formula,
    componentProjectionFormulaMetrics(projection, fixture, extraMetrics)
  );
  return {
    formula,
    total: roundFantasyValue(breakdown.value),
    terms: breakdown.terms
  };
}

export function projectionRoundFormulaWithBreakdown(
  fixtures: PlannerFixture[],
  playerId: string,
  index: ReturnType<typeof buildFormulaProjectionIndex>,
  config: ProjectionFormulaConfig
) {
  if (fixtures.length === 0) return null;
  const fixtureBreakdowns = fixtures.map((fixture) => {
    const key = fixturePlayerProjectionKey(fixture.id, playerId);
    const projection = index.byFixturePlayer.get(key);
    if (!projection) return null;
    const breakdown = projectionFormulaWithBreakdown(
      projection,
      fixture,
      config,
      index.formulaMetricsByFixturePlayer.get(key)
    );
    return { fixture, breakdown };
  });
  if (!fixtureBreakdowns.every((item): item is NonNullable<typeof item> => item !== null)) return null;

  const hasMultipleFixtures = fixtureBreakdowns.length > 1;
  return {
    formula: fixtureBreakdowns[0].breakdown.formula,
    total: roundFantasyValue(fixtureBreakdowns.reduce((total, item) => total + item.breakdown.total, 0)),
    terms: fixtureBreakdowns.flatMap(({ fixture, breakdown }) => breakdown.terms.map((term) => ({
      ...term,
      fixtureLabel: hasMultipleFixtures ? `${fixture.side} ${fixture.opponentName}` : undefined
    })))
  };
}

export function componentProjectionFantasyPoints(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  scoringModel: ActiveScoringModel
) {
  const positionFormula =
    projection.position === "GK"
      ? scoringModel.customFormulaGk
      : projection.position === "DEF"
        ? scoringModel.customFormulaDef
        : projection.position === "MID"
          ? scoringModel.customFormulaMid
          : scoringModel.customFormulaFwd;
  const formula = positionFormula?.trim() || scoringModel.customFormula?.trim();

  if (!scoringModel.customFormulaEnabled || !formula) return projection.components.total;
  return calculateFantasyScore(componentProjectionFormulaMetrics(projection, fixture), projection.position, scoringModel);
}

export function friendAlternativeProjectionFantasyPoints(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  scoringModel: ActiveScoringModel
) {
  return calculateAlternativeScore(
    componentProjectionFormulaMetrics(projection, fixture),
    projection.position,
    scoringModel
  );
}

export function bookmakerFixtureMultiplier(
  fixture: Pick<PlannerFixture, "projectedXg" | "projectedXga" | "teamOver15Probability" | "cleanSheetProbability"> | null,
  positionGroup: FantasyPositionGroup
) {
  if (!fixture) return 1;
  const attackSignal = relativeProbabilitySignal(
    fixture.teamOver15Probability,
    poissonOver15Probability(fixture.projectedXg)
  );
  const defenseSignal = relativeProbabilitySignal(
    fixture.cleanSheetProbability,
    poissonCleanSheetProbability(fixture.projectedXga)
  );
  const weights = bookmakerSignalWeights(positionGroup);
  return clamp(1 + (attackSignal - 1) * weights.attack + (defenseSignal - 1) * weights.defense, 0.85, 1.15);
}

export function calibratedPlayerFixturePoints(
  row: SharedMachetePlayerRow & { teamId: string; playerId: string },
  fixture: PlannerFixture | null,
  calibration: FantasyProjectionCalibrationModel | null,
  scoringModel?: ActiveScoringModel
) {
  const rawFixtureScore = scoringModel
    ? calculateFantasyScore(fixtureFormulaMetrics(row.rawMetrics, fixture), row.position, scoringModel)
    : row.fantasyScore;
  if (typeof rawFixtureScore !== "number" || !Number.isFinite(rawFixtureScore)) return null;
  const position = normalizeFantasyPosition(row.position);
  const fixtureScore = rawFixtureScore * (
    scoringModel && expectedFormulaUsesBookmaker(scoringModel, position)
      ? 1
      : bookmakerFixtureMultiplier(fixture, position)
  );
  if (!calibration) return fixtureScore;

  if (position === "UNK") return fixtureScore;
  const recentPoints = row.recentFp.filter(Number.isFinite);
  const baselinePoints = recentPoints.length > 0 ? average(recentPoints) : fixtureScore;
  const expectedMinutes = row.expectedMinutes ?? 0;
  const startRate = row.startProbability ?? 0;
  const minutesDeviation = row.minutesDeviation ?? 0;
  const sample: FantasyBacktestSample = {
    matchId: fixture?.id ?? `upcoming:${row.teamId}:${row.playerId}`,
    playerId: row.playerId,
    teamId: row.teamId,
    opponentTeamId: fixture?.opponentTeamId ?? null,
    isHome: fixture ? fixture.side === "H" : null,
    homeTeamId: fixture?.side === "A" ? fixture.opponentTeamId : row.teamId,
    awayTeamId: fixture?.side === "H" ? fixture.opponentTeamId : row.teamId,
    homeScore: null,
    awayScore: null,
    homeXg: null,
    awayXg: null,
    matchDate: fixture?.kickoffAt?.toISOString() ?? new Date().toISOString(),
    position,
    playingTimeGroup:
      startRate >= 0.8 && expectedMinutes >= 60
        ? "STABLE_STARTER"
        : (startRate >= 0.2 && startRate < 0.8) || minutesDeviation >= 25
          ? "UNCERTAIN_MINUTES"
          : "OTHER",
    historyMatchIds: recentPoints.map((_, index) => `history:${index}`),
    historyFeatures: {
      expectedMinutes,
      startRate,
      minutesDeviation,
      averageRating: row.averageRating ?? 0,
      recentPointsDeviation: standardDeviation(recentPoints, baselinePoints),
      recentPointsTrend: recentTrend(recentPoints)
    },
    predictedPoints: fixtureScore,
    baselinePoints,
    seasonBaselinePoints: baselinePoints,
    actualPoints: 0
  };

  return predictCalibratedFantasyPoints(calibration, sample);
}

export function buildFantasyForecastExplanation(input: {
  matchesPlayed: number;
  expectedMinutes: number | null;
  forecastConfidence: number | null;
  recentFp: number[];
  fixtureDifficulties: Array<number | null>;
  isStarter: boolean | null;
}) {
  const factors: string[] = [];
  const risks: string[] = [];

  if (input.isStarter === true) factors.push("Active-roster starter flag");
  if (input.matchesPlayed >= 5) factors.push("Five-match historical sample");
  if ((input.expectedMinutes ?? 0) >= 70) factors.push(`Expected minutes ${Math.round(input.expectedMinutes ?? 0)}`);
  if (recentTrend(input.recentFp) > 0.5) factors.push("Recent fantasy-points trend is positive");
  if (input.fixtureDifficulties.some((difficulty) => difficulty !== null && difficulty <= 2)) factors.push("Favourable upcoming fixture");

  if (input.matchesPlayed === 0) risks.push("No prior match statistics");
  if (input.expectedMinutes !== null && input.expectedMinutes < 60) risks.push(`Expected minutes only ${Math.round(input.expectedMinutes)}`);
  if (input.forecastConfidence === null || input.forecastConfidence < 0.6) risks.push("Low forecast confidence");
  if (input.fixtureDifficulties.length === 0 || input.fixtureDifficulties.every((difficulty) => difficulty === null)) risks.push("Upcoming fixture strength is unavailable");
  if (input.fixtureDifficulties.some((difficulty) => difficulty !== null && difficulty >= 4)) risks.push("Difficult upcoming fixture");

  if (factors.length === 0) factors.push("Historical per-match event rates");
  return { factors, risks };
}

function recentTrend(values: number[]) {
  if (values.length < 3) return 0;
  const recent = values.slice(-2);
  const earlier = values.slice(0, -2);
  return average(recent) - average(earlier);
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function standardDeviation(values: number[], mean: number) {
  return values.length > 0 ? Math.sqrt(average(values.map((value) => (value - mean) ** 2))) : 0;
}

async function loadUpcomingRoundFixtures(
  prisma: PrismaClient,
  league: SharedLeagueSeasonOption,
  provider = "SPORTS_RU",
  contestId: string | null = null,
  scheduleRevision: string | null = null
) {
  const key = `${provider}:${contestId ?? "no-contest"}:${scheduleRevision ?? "no-schedule"}:${league.leagueId}:${league.season}`;
  return upcomingRoundFixturesCache.getOrCreate(key, upcomingRoundFixturesCacheTtlMs, () =>
    loadUpcomingRoundFixturesUncached(prisma, league, provider, contestId)
  );
}

async function loadUpcomingRoundFixturesUncached(
  prisma: PrismaClient,
  league: SharedLeagueSeasonOption,
  provider: string,
  contestId: string | null
) {
  const now = new Date();
  const activeRoundLookback = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
  const providerMatches = await loadProviderPlannerMatches(prisma, provider, contestId, activeRoundLookback, now);
  if (providerMatches !== null) {
    return finalizeProviderPlannerMatches(prisma, league, providerMatches, now);
  }
  const [matches, teamStrength, seasonTeams] = await Promise.all([
    prisma.coreMatch.findMany({
      where: {
        leagueId: league.leagueId,
        season: league.season,
        cancelled: false,
        // Keep the beginning of an in-progress round. Its already completed
        // fixtures must stay in the round total alongside the remaining ones.
        OR: [{ finished: false }, { matchDate: { gte: activeRoundLookback } }]
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        oddsSnapshots: {
          where: { provider: "FONBET", status: "AVAILABLE" },
          orderBy: { fetchedAt: "desc" },
          take: 1
        }
      },
      orderBy: [{ matchDate: "asc" }, { id: "asc" }],
      take: 180
    }),
    loadTeamStrengthProfiles(prisma, league.leagueId),
    prisma.leagueSeasonTeam.findMany({
      where: {
        leagueId: league.leagueId,
        season: league.season,
        active: true
      },
      select: {
        teamId: true,
        metadata: true
      }
    })
  ]);
  const missingShortNameTeamIds = seasonTeams
    .filter((row) => !providerTeamShortName({ metadata: row.metadata }))
    .map((row) => row.teamId);
  const fallbackSeasonTeams = missingShortNameTeamIds.length > 0
    ? await prisma.leagueSeasonTeam.findMany({
        where: { teamId: { in: missingShortNameTeamIds } },
        select: { teamId: true, metadata: true },
        orderBy: { updatedAt: "desc" }
      })
    : [];
  const shortNameByTeamId = fantasyTeamShortNamesByTeamId(seasonTeams, fallbackSeasonTeams);
  const coreFixtures = buildPlannerRoundFixtures(
    matches.map((match) => {
      const odds = match.oddsSnapshots[0];
      const freshOdds = odds && fixtureOddsAreFresh(odds.fetchedAt, now) ? odds : null;
      return {
      id: String(match.id),
      round: match.round,
      matchDate: match.matchDate,
      homeTeamId: match.homeTeamId ? String(match.homeTeamId) : null,
      awayTeamId: match.awayTeamId ? String(match.awayTeamId) : null,
      homeTeamName: (match.homeTeamId ? shortNameByTeamId.get(String(match.homeTeamId)) : null) ?? match.homeTeam?.name ?? null,
      awayTeamName: (match.awayTeamId ? shortNameByTeamId.get(String(match.awayTeamId)) : null) ?? match.awayTeam?.name ?? null,
      homeTeamFullName: match.homeTeam?.name ?? null,
      awayTeamFullName: match.awayTeam?.name ?? null,
      finished: match.finished,
      cancelled: match.cancelled,
      homeOver15Probability: freshOdds?.homeOver15Probability ?? null,
      awayOver15Probability: freshOdds?.awayOver15Probability ?? null,
      homeCleanSheetProbability: freshOdds?.homeCleanSheetProbability ?? null,
      awayCleanSheetProbability: freshOdds?.awayCleanSheetProbability ?? null,
      oddsFetchedAt: freshOdds?.fetchedAt ?? null
      };
    }),
    now
  );

  if (coreFixtures.rounds.length > 0) {
    return {
      ...applyFixtureStrength({ ...coreFixtures, teamShortNameById: shortNameByTeamId }, teamStrength.profiles),
      formulaAdaptationTeamProfiles: teamStrength.formulaAdaptationTeamProfiles
    };
  }

  const legacyFixtures = await loadLegacyMacheteUpcomingRoundFixtures(prisma, league, now);
  return {
    ...applyFixtureStrength({ ...legacyFixtures, teamShortNameById: shortNameByTeamId }, teamStrength.profiles),
    formulaAdaptationTeamProfiles: teamStrength.formulaAdaptationTeamProfiles
  };
}

async function loadProviderPlannerMatches(
  prisma: PrismaClient,
  provider: string,
  contestId: string | null,
  activeRoundLookback: Date,
  now: Date
): Promise<PlannerMatch[] | null> {
  if (!contestId || !["SPORTS_RU", FPL_PROVIDER].includes(provider)) return null;
  const delegate = (prisma as unknown as {
    fantasyProviderFixture?: PrismaClient["fantasyProviderFixture"];
  }).fantasyProviderFixture;
  // Old narrow unit-test doubles do not expose the newly generated delegate.
  // The real Prisma client always does; an empty real table therefore returns
  // an empty schedule and never falls back to FotMob rounds.
  if (!delegate) return null;

  const fixtures = await delegate.findMany({
    where: {
      contestId,
      roundId: { not: null },
      OR: [
        { kickoffAt: { gte: activeRoundLookback } },
        { status: null },
        { status: { notIn: ["FINISHED", "COMPLETED", "PLAYED", "CANCELLED", "POSTPONED"] } }
      ]
    },
    include: {
      round: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      match: {
        include: {
          oddsSnapshots: {
            where: { provider: "FONBET", status: "AVAILABLE" },
            orderBy: { fetchedAt: "desc" },
            take: 1
          }
        }
      }
    },
    orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }],
    take: 500
  });

  return fixtures.flatMap((fixture): PlannerMatch[] => {
    if (!fixture.round) return [];
    const odds = fixture.match?.oddsSnapshots[0];
    const freshOdds = odds && fixtureOddsAreFresh(odds.fetchedAt, now) ? odds : null;
    const status = fixture.status?.toUpperCase() ?? "";
    return [{
      id: `provider-fixture:${provider.toLocaleLowerCase("en-US")}:${fixture.providerFixtureId}`,
      round: fixture.sourceRoundLabel,
      providerRoundId: fantasyProviderRoundKey(provider, fixture.round.ordinal, fixture.round.providerRoundId),
      providerRoundLabel: fixture.round.name,
      providerRoundOrdinal: fixture.round.ordinal,
      matchDate: fixture.kickoffAt ?? fixture.match?.matchDate ?? null,
      homeTeamId: fixture.homeTeamId ? String(fixture.homeTeamId) : null,
      awayTeamId: fixture.awayTeamId ? String(fixture.awayTeamId) : null,
      homeTeamName: fixture.homeTeam?.name ?? fixture.providerHomeTeamName ?? providerTeamIdLabel(fixture.providerHomeTeamId),
      awayTeamName: fixture.awayTeam?.name ?? fixture.providerAwayTeamName ?? providerTeamIdLabel(fixture.providerAwayTeamId),
      homeTeamFullName: fixture.homeTeam?.name ?? fixture.providerHomeTeamName ?? providerTeamIdLabel(fixture.providerHomeTeamId),
      awayTeamFullName: fixture.awayTeam?.name ?? fixture.providerAwayTeamName ?? providerTeamIdLabel(fixture.providerAwayTeamId),
      finished: fixture.match?.finished === true || ["FINISHED", "COMPLETED", "PLAYED"].includes(status),
      cancelled: fixture.match?.cancelled === true || ["CANCELLED", "POSTPONED"].includes(status),
      homeOver15Probability: freshOdds?.homeOver15Probability ?? null,
      awayOver15Probability: freshOdds?.awayOver15Probability ?? null,
      homeCleanSheetProbability: freshOdds?.homeCleanSheetProbability ?? null,
      awayCleanSheetProbability: freshOdds?.awayCleanSheetProbability ?? null,
      oddsFetchedAt: freshOdds?.fetchedAt ?? null
    }];
  });
}

async function fantasyContestCacheMetadata(
  prisma: PrismaClient,
  league: Pick<SharedLeagueSeasonOption, "leagueId" | "season">,
  provider: string,
  contestId?: string | null
) {
  const contest = await fantasyContestClient(prisma).findFirst({
    where: {
      ...(contestId ? { id: contestId } : {}),
      provider,
      leagueId: league.leagueId,
      season: provider === FPL_PROVIDER ? FPL_SEASON : { in: sportsRuSeasonAliases(league.season) }
    },
    orderBy: { lastSyncedAt: "desc" },
    select: { id: true, lastSyncedAt: true, scheduleRevision: true }
  });
  return {
    // Preserve an explicitly requested ID so the uncached loader can reject
    // an out-of-scope contest instead of silently selecting another one.
    contestId: contest?.id ?? contestId ?? null,
    revision: contest
      ? `${contest.lastSyncedAt?.toISOString() ?? "never"}:${contest.scheduleRevision ?? "no-schedule"}`
      : "no-contest"
  };
}

async function finalizeProviderPlannerMatches(
  prisma: PrismaClient,
  league: SharedLeagueSeasonOption,
  matches: PlannerMatch[],
  now: Date
) {
  const [teamStrength, seasonTeams] = await Promise.all([
    loadTeamStrengthProfiles(prisma, league.leagueId),
    prisma.leagueSeasonTeam.findMany({
      where: { leagueId: league.leagueId, season: league.season, active: true },
      select: { teamId: true, metadata: true }
    })
  ]);
  const missingShortNameTeamIds = seasonTeams
    .filter((row) => !providerTeamShortName({ metadata: row.metadata }))
    .map((row) => row.teamId);
  const fallbackSeasonTeams = missingShortNameTeamIds.length > 0
    ? await prisma.leagueSeasonTeam.findMany({
        where: { teamId: { in: missingShortNameTeamIds } },
        select: { teamId: true, metadata: true },
        orderBy: { updatedAt: "desc" }
      })
    : [];
  const shortNameByTeamId = fantasyTeamShortNamesByTeamId(seasonTeams, fallbackSeasonTeams);
  const rounds = buildPlannerRoundFixtures(matches.map((match) => ({
    ...match,
    homeTeamName: (match.homeTeamId ? shortNameByTeamId.get(match.homeTeamId) : null) ?? match.homeTeamName,
    awayTeamName: (match.awayTeamId ? shortNameByTeamId.get(match.awayTeamId) : null) ?? match.awayTeamName
  })), now);
  return {
    ...applyFixtureStrength({ ...rounds, teamShortNameById: shortNameByTeamId }, teamStrength.profiles),
    formulaAdaptationTeamProfiles: teamStrength.formulaAdaptationTeamProfiles
  };
}

export function fantasyProviderRoundKey(provider: string, ordinal: number, providerRoundId: string) {
  if (provider === FPL_PROVIDER) return `fpl:event:${ordinal}`;
  if (provider === "SPORTS_RU") return `sports-ru:tour:${ordinal}:${encodeURIComponent(providerRoundId)}`;
  return `${provider.toLocaleLowerCase("en-US").replace(/_/g, "-")}:round:${ordinal}:${encodeURIComponent(providerRoundId)}`;
}

function providerTeamIdLabel(providerTeamId: string) {
  const words = providerTeamId.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!words) return "—";
  if (/^\d+$/.test(words)) return `#${words}`;
  return words.replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-US"));
}

export function buildPlannerRoundFixtures(matches: PlannerMatch[], now = new Date()): PlannerRoundFixtures {
  const eligible = matches.filter((match) => !match.cancelled);
  const upcoming = eligible.filter((match) => !match.finished && (!match.matchDate || match.matchDate >= startOfTodayUtc(now)));
  const upcomingGroups = groupMatchesByRound(upcoming);
  const firstUpcomingRoundId = upcomingGroups[0]?.id ?? null;
  const allGroups = groupMatchesByRound(eligible);
  const firstUpcomingIndex = firstUpcomingRoundId === null ? -1 : allGroups.findIndex((group) => group.id === firstUpcomingRoundId);
  // For the first still-open round retain its finished fixtures too. Otherwise
  // a split round becomes a forecast for only the remaining games, which makes
  // the displayed squad total collapse mid-tour. Subsequent rounds keep only
  // their unplayed fixtures; fully completed earlier rounds stay excluded.
  const grouped = firstUpcomingIndex >= 0
    ? allGroups.slice(firstUpcomingIndex).map((group) => ({
        ...group,
        matches: group.id === firstUpcomingRoundId ? group.matches : group.matches.filter((match) => !match.finished)
      })).filter((group) => group.matches.length > 0)
    : groupMatchesByRound(eligible.filter((match) => !match.finished));
  const rounds = grouped.slice(0, maxProjectionRounds).map((group, index) => ({
    id: group.id,
    label: group.label || `Round ${index + 1}`,
    startsAt: group.startsAt?.toISOString() ?? null,
    fixtureCount: group.matches.length
  }));
  const selectedRoundIds = new Set(rounds.map((round) => round.id));
  const fixturesByTeamRound = new Map<string, Map<string, PlannerFixture[]>>();

  for (const group of grouped) {
    if (!selectedRoundIds.has(group.id)) continue;
    for (const match of group.matches) {
      if (match.homeTeamId) {
        addTeamFixture(fixturesByTeamRound, group.id, {
          id: match.id,
          roundId: group.id,
          teamId: match.homeTeamId,
          teamName: match.homeTeamName ?? "Team",
          teamFullName: match.homeTeamFullName ?? match.homeTeamName ?? "Team",
          opponentTeamId: match.awayTeamId,
          opponentName: match.awayTeamName ?? "—",
          opponentFullName: match.awayTeamFullName ?? match.awayTeamName ?? "—",
          side: "H",
          kickoffAt: match.matchDate,
          projectedXg: null,
          projectedXga: null,
          attackMultiplier: null,
          defenseMultiplier: null,
          teamOver15Probability: match.homeOver15Probability ?? null,
          cleanSheetProbability: match.homeCleanSheetProbability ?? null,
          oddsFetchedAt: match.oddsFetchedAt ?? null,
          finished: match.finished
        });
      }
      if (match.awayTeamId) {
        addTeamFixture(fixturesByTeamRound, group.id, {
          id: match.id,
          roundId: group.id,
          teamId: match.awayTeamId,
          teamName: match.awayTeamName ?? "Team",
          teamFullName: match.awayTeamFullName ?? match.awayTeamName ?? "Team",
          opponentTeamId: match.homeTeamId,
          opponentName: match.homeTeamName ?? "—",
          opponentFullName: match.homeTeamFullName ?? match.homeTeamName ?? "—",
          side: "A",
          kickoffAt: match.matchDate,
          projectedXg: null,
          projectedXga: null,
          attackMultiplier: null,
          defenseMultiplier: null,
          teamOver15Probability: match.awayOver15Probability ?? null,
          cleanSheetProbability: match.awayCleanSheetProbability ?? null,
          oddsFetchedAt: match.oddsFetchedAt ?? null,
          finished: match.finished
        });
      }
    }
  }

  return {
    rounds,
    fixturesByTeamRound,
    teamShortNameById: new Map()
  };
}

export function buildBookmakerFavorites(fixtures: PlannerRoundFixtures): FantasyBookmakerFavorite[] {
  const roundOrder = new Map(fixtures.rounds.map((round, index) => [round.id, index]));
  const roundLabel = new Map(fixtures.rounds.map((round) => [round.id, round.label]));
  const favorites: FantasyBookmakerFavorite[] = [];

  for (const round of fixtures.rounds) {
    const fixtureSides = new Map<string, Map<string, PlannerFixture>>();
    for (const teamFixtures of fixtures.fixturesByTeamRound.get(round.id)?.values() ?? []) {
      for (const fixture of teamFixtures) {
        if (fixture.finished) continue;
        const sides = fixtureSides.get(fixture.id) ?? new Map<string, PlannerFixture>();
        sides.set(fixture.teamId, fixture);
        fixtureSides.set(fixture.id, sides);
      }
    }

    for (const sidesByTeam of fixtureSides.values()) {
      const sides = [...sidesByTeam.values()];
      const pricedSides = sides.filter(hasCompleteBookmakerMarket);
      if (pricedSides.length === 0) continue;
      pricedSides.sort(compareBookmakerFavoriteSides);

      const favorite = pricedSides[0];
      const opponentSide = sides.find((side) => side.teamId === favorite.opponentTeamId) ?? null;
      const teamName = favorite.teamName
        ?? fixtures.teamShortNameById.get(favorite.teamId)
        ?? opponentSide?.opponentName
        ?? favorite.teamId;
      const teamFullName = favorite.teamFullName ?? opponentSide?.opponentFullName ?? teamName;

      favorites.push({
        fixtureId: favorite.id,
        roundId: favorite.roundId,
        roundLabel: roundLabel.get(favorite.roundId) ?? favorite.roundId,
        kickoffAt: favorite.kickoffAt?.toISOString() ?? null,
        teamId: favorite.teamId,
        teamName,
        teamFullName,
        opponentTeamId: favorite.opponentTeamId,
        opponentName: favorite.opponentName,
        opponentFullName: favorite.opponentFullName,
        side: favorite.side,
        teamOver15Probability: favorite.teamOver15Probability,
        cleanSheetProbability: favorite.cleanSheetProbability,
        oddsFetchedAt: favorite.oddsFetchedAt.toISOString(),
        source: "FONBET"
      });
    }
  }

  return favorites.sort((left, right) =>
    (roundOrder.get(left.roundId) ?? Number.MAX_SAFE_INTEGER) - (roundOrder.get(right.roundId) ?? Number.MAX_SAFE_INTEGER)
    || right.teamOver15Probability - left.teamOver15Probability
    || right.cleanSheetProbability - left.cleanSheetProbability
    || left.teamName.localeCompare(right.teamName)
  );
}

function hasCompleteBookmakerMarket(fixture: PlannerFixture): fixture is PlannerFixture & {
  teamOver15Probability: number;
  cleanSheetProbability: number;
  oddsFetchedAt: Date;
} {
  return validProbability(fixture.teamOver15Probability)
    && validProbability(fixture.cleanSheetProbability)
    && fixture.oddsFetchedAt instanceof Date
    && !Number.isNaN(fixture.oddsFetchedAt.getTime());
}

function compareBookmakerFavoriteSides(
  left: PlannerFixture & { teamOver15Probability: number; cleanSheetProbability: number },
  right: PlannerFixture & { teamOver15Probability: number; cleanSheetProbability: number }
) {
  return right.teamOver15Probability - left.teamOver15Probability
    || right.cleanSheetProbability - left.cleanSheetProbability
    || Number(left.side === "A") - Number(right.side === "A");
}

function validProbability(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function projectFixtureFantasyPoints(
  basePoints: number,
  positionGroup: FantasyPositionGroup,
  fixture: FantasyFixtureProjection
) {
  return basePoints * fixtureMultiplier(fixture, positionGroup);
}

export function fixtureDifficultyFromMultipliers(
  fixture: Pick<PlannerFixture, "attackMultiplier" | "defenseMultiplier" | "side">,
  positionGroup: FantasyPositionGroup
): number | null {
  const attack = fixture.attackMultiplier;
  const defense = fixture.defenseMultiplier;
  if (attack === null && defense === null) return null;

  const weights = fixtureSignalWeights(positionGroup);
  const weightTotal = weights.attack + weights.defense;
  const attackComponent = attack ?? defense ?? 1;
  const defenseComponent = defense ?? attack ?? 1;
  const score = weightTotal > 0
    ? (attackComponent * weights.attack + defenseComponent * weights.defense) / weightTotal
    : 1;

  if (score >= 1.18) return 1;
  if (score >= 1.06) return 2;
  if (score >= 0.94) return 3;
  if (score >= 0.82) return 4;
  return 5;
}

export function aggregateRoundDifficulty(
  teamFixtures: PlannerFixture[],
  positionGroup: FantasyPositionGroup
): number | null {
  if (teamFixtures.length === 0) return null;
  const values = teamFixtures
    .map((fixture) => fixtureDifficultyFromMultipliers(fixture, positionGroup))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round(sum(values) / values.length);
}

export function buildTeamStrengthProfilesFromMatches(
  matches: TeamStrengthMatchInput[],
  options: { fallbackToGoals?: boolean } = {}
): TeamStrengthProfiles {
  const samples: TeamStrengthSample[] = [];
  const datedMatches = matches
    .map((match) => teamStrengthMatchDateMs(match.matchDate))
    .filter((value): value is number => value !== null);
  const referenceDateMs = datedMatches.length > 0 ? Math.max(...datedMatches) : null;

  for (const match of matches) {
    const weight = teamStrengthRecencyWeight(match.matchDate, referenceDateMs);
    for (const stat of match.teamStats) {
      const teamId = stat.teamId.trim();
      if (!teamId) continue;

      const opponent = findOpponentTeamStat(match, stat);
      const side = teamStatSide(match, stat);
      if (!side) continue;

      samples.push({
        teamId,
        side,
        xgFor: numericOrNull(stat.xg) ?? (options.fallbackToGoals ? numericOrNull(stat.goals) : null),
        xgAgainst: numericOrNull(opponent?.xg) ?? (options.fallbackToGoals ? numericOrNull(opponent?.goals) : null),
        weight
      });
    }
  }

  const teamIds = new Set(samples.map((sample) => sample.teamId));
  const league = profileFromSamples(samples);
  const byTeamId = new Map<string, TeamStrengthProfile>();
  for (const teamId of teamIds) {
    const teamSamples = samples.filter((sample) => sample.teamId === teamId);
    byTeamId.set(teamId, profileFromSamples(teamSamples, league));
  }

  return {
    byTeamId,
    league
  };
}

function applyFixtureStrength(fixtures: PlannerRoundFixtures, profiles: TeamStrengthProfiles): PlannerRoundFixtures {
  for (const roundFixtures of fixtures.fixturesByTeamRound.values()) {
    for (const teamFixtures of roundFixtures.values()) {
      for (const fixture of teamFixtures) {
        const projection = fixtureStrengthProjection(fixture, profiles);
        fixture.projectedXg = projection.projectedXg;
        fixture.projectedXga = projection.projectedXga;
        const marketProjection = fixtureStrengthWithBookmaker(projection, fixture);
        fixture.attackMultiplier = marketProjection.attackMultiplier;
        fixture.defenseMultiplier = marketProjection.defenseMultiplier;
      }
    }
  }

  return fixtures;
}

export function fixtureStrengthProjection(
  fixture: Pick<PlannerFixture, "teamId" | "opponentTeamId" | "side">,
  profiles: TeamStrengthProfiles
) {
  const side = fixture.side === "H" ? "home" : "away";
  const opponentSide = fixture.side === "H" ? "away" : "home";
  const teamProfile = profiles.byTeamId.get(fixture.teamId);
  const opponentProfile = fixture.opponentTeamId ? profiles.byTeamId.get(fixture.opponentTeamId) : undefined;
  const own = strengthBlockForSide(teamProfile, side, profiles.league);
  const opponent = strengthBlockForSide(opponentProfile, opponentSide, profiles.league);
  const leagueSide = strengthBlockForSide(undefined, side, profiles.league);
  const leagueOpponentSide = strengthBlockForSide(undefined, opponentSide, profiles.league);
  const leagueAttackAverage = profiles.league.overall.xgForPerMatch ?? defaultTeamXgPerMatch;
  const leagueDefenseAverage = profiles.league.overall.xgAgainstPerMatch ?? defaultTeamXgPerMatch;
  const attackBase = leagueSide.xgForPerMatch ?? leagueAttackAverage;
  const defenseBase = leagueSide.xgAgainstPerMatch ?? leagueDefenseAverage;
  const opponentAttackBase = leagueOpponentSide.xgForPerMatch ?? profiles.league.overall.xgForPerMatch ?? defaultTeamXgPerMatch;
  const opponentDefenseBase = leagueOpponentSide.xgAgainstPerMatch ?? profiles.league.overall.xgAgainstPerMatch ?? defaultTeamXgPerMatch;
  const projectedXg = attackBase
    * strengthRatio(own.xgForPerMatch, attackBase)
    * strengthRatio(opponent.xgAgainstPerMatch, opponentDefenseBase);
  const projectedXga = opponentAttackBase
    * strengthRatio(opponent.xgForPerMatch, opponentAttackBase)
    * strengthRatio(own.xgAgainstPerMatch, defenseBase);

  return {
    projectedXg,
    projectedXga,
    attackBase: leagueAttackAverage,
    defenseBase: leagueDefenseAverage,
    attackMultiplier: ratioMultiplier(projectedXg, leagueAttackAverage),
    defenseMultiplier: ratioMultiplier(leagueDefenseAverage, projectedXga)
  };
}

export function fixtureStrengthWithBookmaker(
  projection: Pick<ReturnType<typeof fixtureStrengthProjection>, "projectedXg" | "projectedXga" | "attackBase" | "defenseBase">,
  odds: Pick<PlannerFixture, "teamOver15Probability" | "cleanSheetProbability">
) {
  const bookmakerXg = inversePoissonOver15Probability(odds.teamOver15Probability);
  const bookmakerXga = bookmakerImpliedGoalsAgainst(odds.cleanSheetProbability);
  const marketProjectedXg = blendModelAndBookmakerExpectation(projection.projectedXg, bookmakerXg);
  const marketProjectedXga = blendModelAndBookmakerExpectation(projection.projectedXga, bookmakerXga);

  return {
    marketProjectedXg,
    marketProjectedXga,
    attackMultiplier: ratioMultiplier(marketProjectedXg, projection.attackBase),
    defenseMultiplier: ratioMultiplier(projection.defenseBase, marketProjectedXga)
  };
}

function bookmakerImpliedGoalsAgainst(cleanSheetProbability: number | null | undefined) {
  if (typeof cleanSheetProbability !== "number" || !Number.isFinite(cleanSheetProbability) || cleanSheetProbability <= 0 || cleanSheetProbability > 1) {
    return null;
  }
  return -Math.log(cleanSheetProbability);
}

function blendModelAndBookmakerExpectation(model: number, bookmaker: number | null) {
  if (bookmaker === null) return model;
  return clamp(model * 0.55 + bookmaker * 0.45, model * 0.7, model * 1.35);
}

async function loadTeamStrengthProfiles(prisma: PrismaClient, leagueId: bigint) {
  const feederLeagueId = teamStrengthFeederLeagueByTopLeague.get(String(leagueId));
  const [matches, feederMatches] = await Promise.all([
    loadTeamStrengthMatches(prisma, leagueId),
    feederLeagueId ? loadTeamStrengthMatches(prisma, feederLeagueId) : Promise.resolve([])
  ]);
  const profiles = buildTeamStrengthProfilesFromMatches(matches);
  const formulaAdaptationTeamProfiles = buildFormulaAdaptationTeamProfiles(matches);
  if (!feederLeagueId || feederMatches.length === 0) {
    return { profiles, formulaAdaptationTeamProfiles };
  }

  const feederProfiles = buildTeamStrengthProfilesFromMatches(feederMatches, { fallbackToGoals: true });
  const feederFormulaProfiles = buildFormulaAdaptationTeamProfiles(feederMatches);
  return {
    profiles: addPromotedTeamStrengthProfiles(profiles, feederProfiles),
    formulaAdaptationTeamProfiles: addPromotedFormulaAdaptationTeamProfiles(
      formulaAdaptationTeamProfiles,
      feederFormulaProfiles,
      {
        strengthFactor: promotedTeamStrengthFactor,
        ratioExponent: promotedTeamRatioExponent,
        priorMatches: promotedTeamPriorMatches
      }
    )
  };
}

async function loadTeamStrengthMatches(prisma: PrismaClient, leagueId: bigint): Promise<TeamStrengthMatchInput[]> {
  const matches = await prisma.coreMatch.findMany({
    where: {
      leagueId,
      finished: true,
      cancelled: false
    },
    orderBy: [{ matchDate: "desc" }, { id: "desc" }],
    take: 600,
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      matchDate: true,
      shots: {
        select: {
          teamId: true,
          normalizedY: true,
          xg: true
        }
      },
      teamStats: {
        select: {
          teamId: true,
          opponentTeamId: true,
          isHome: true,
          xg: true,
          goals: true,
          shots: true,
          shotsOnTarget: true,
          bigChances: true,
          touchesInOppBox: true,
          possession: true,
          passes: true,
          accuratePasses: true,
          passAccuracy: true
        }
      }
    }
  });

  return matches.map((match) => {
    const parsedTeamStats = match.teamStats.map((stat) => ({
      teamId: String(stat.teamId),
      opponentTeamId: stringifyBigInt(stat.opponentTeamId),
      isHome: stat.isHome,
      xg: stat.xg,
      goals: stat.goals,
      shots: stat.shots,
      shotsOnTarget: stat.shotsOnTarget,
      bigChances: stat.bigChances,
      touchesInOppBox: stat.touchesInOppBox,
      possession: stat.possession,
      passes: stat.passes,
      accuratePasses: stat.accuratePasses,
      passAccuracy: stat.passAccuracy
    }));
    return fillTeamStrengthStatsFromScore({
      homeTeamId: stringifyBigInt(match.homeTeamId),
      awayTeamId: stringifyBigInt(match.awayTeamId),
      matchDate: match.matchDate,
      teamStats: parsedTeamStats,
      shots: match.shots.map((shot) => ({
        teamId: stringifyBigInt(shot.teamId),
        normalizedY: shot.normalizedY,
        xg: shot.xg
      })),
      homeScore: match.homeScore,
      awayScore: match.awayScore
    });
  });
}

export function fillTeamStrengthStatsFromScore(
  match: TeamStrengthMatchInput & { homeScore?: number | null; awayScore?: number | null }
): TeamStrengthMatchInput {
  const homeTeamId = match.homeTeamId?.trim() || null;
  const awayTeamId = match.awayTeamId?.trim() || null;
  const scoreRows = homeTeamId && awayTeamId && match.homeScore !== null && match.homeScore !== undefined
    && match.awayScore !== null && match.awayScore !== undefined
    ? [
        { teamId: homeTeamId, opponentTeamId: awayTeamId, isHome: true, xg: null, goals: match.homeScore },
        { teamId: awayTeamId, opponentTeamId: homeTeamId, isHome: false, xg: null, goals: match.awayScore }
      ]
    : [];
  const byTeamId = new Map<string, TeamStrengthMatchInput["teamStats"][number]>(scoreRows.map((row) => [row.teamId, row]));

  for (const stat of match.teamStats) {
    const scoreRow = byTeamId.get(stat.teamId);
    byTeamId.set(stat.teamId, {
      ...scoreRow,
      ...stat,
      goals: numericOrNull(stat.goals) ?? scoreRow?.goals ?? null
    });
  }

  return {
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    matchDate: match.matchDate,
    teamStats: [...byTeamId.values()],
    shots: match.shots
  };
}

export async function loadSportsRuFantasyPositionsByPlayerId(
  prisma: Pick<PrismaClient, "fantasyPlayerPrice" | "providerEntityMap">,
  input: {
    leagueId: bigint;
    season: string;
    contestId?: string | null;
  }
) {
  const priceRows = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: "SPORTS_RU",
      ...(input.contestId ? { contestId: input.contestId } : {}),
      leagueId: input.leagueId,
      season: { in: sportsRuSeasonAliases(input.season) }
    },
    select: {
      id: true,
      playerId: true,
      position: true,
      positionLabel: true,
      sourceKind: true,
      sourceRowIndex: true
    },
    orderBy: { lastSeenAt: "desc" }
  });
  if (priceRows.length === 0) return new Map<string, string>();

  const maps = await prisma.providerEntityMap.findMany({
    where: {
      provider: "SPORTS_RU",
      ...(input.contestId ? { contestId: input.contestId } : {}),
      providerSeason: { in: sportsRuSeasonAliases(input.season) },
      providerEntityType: "FANTASY_PLAYER_PRICE",
      providerEntityId: { in: priceRows.map((row) => row.id) },
      internalEntityType: "PLAYER",
      internalEntityId: { not: null }
    },
    select: {
      providerEntityId: true,
      internalEntityId: true
    }
  });
  return sportsRuFantasyPositionsByPlayerId(priceRows, maps);
}

export async function loadSportsRuFantasyPriceRefsByScopedPlayer(
  prisma: PrismaClient,
  input: {
    scopes: SharedPlayerRowsScope[];
  }
) {
  const priceScopes = sportsRuPriceScopes(input.scopes);
  if (priceScopes.length === 0) return new Map<string, SportsRuFantasyPriceRef>();

  const contests = await fantasyContestClient(prisma).findMany({
    where: {
      provider: "SPORTS_RU",
      OR: priceScopes.map((scope) => ({ leagueId: scope.leagueId, season: scope.season }))
    },
    select: { id: true }
  });
  if (contests.length === 0) return new Map<string, SportsRuFantasyPriceRef>();
  const contestIds = contests.map((contest) => contest.id);

  const priceRows = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: "SPORTS_RU",
      contestId: { in: contestIds },
      OR: priceScopes.map((scope) => ({
        leagueId: scope.leagueId,
        season: scope.season
      }))
    },
    select: {
      id: true,
      leagueId: true,
      season: true,
      playerId: true,
      playerName: true,
      position: true,
      price: true,
      positionLabel: true,
      sourceKind: true,
      sourceRowIndex: true
    },
    orderBy: { lastSeenAt: "desc" }
  });
  if (priceRows.length === 0) return new Map<string, SportsRuFantasyPriceRef>();

  const maps = await prisma.providerEntityMap.findMany({
    where: {
      provider: "SPORTS_RU",
      contestId: { in: contestIds },
      providerSeason: { in: [...new Set(priceRows.map((row) => row.season))] },
      providerEntityType: "FANTASY_PLAYER_PRICE",
      providerEntityId: { in: priceRows.map((row) => row.id) },
      internalEntityType: "PLAYER",
      internalEntityId: { not: null }
    },
    select: {
      providerEntityId: true,
      internalEntityId: true
    }
  });

  return sportsRuFantasyPriceRefsByScopedPlayer(priceRows, maps);
}

export function sportsRuFantasyPositionsByPlayerId(priceRows: SportsRuPositionPriceRow[], priceMaps: SportsRuPositionMapRow[]) {
  const mappedPlayerIdsByPriceId = new Map(
    priceMaps
      .filter((row) => row.internalEntityId)
      .map((row) => [row.providerEntityId, row.internalEntityId as string])
  );
  const positionsByPlayerId = new Map<string, string>();

  for (const row of priceRows) {
    const position = sportsRuPricePosition(row);
    if (!position) continue;
    const playerId = mappedPlayerIdsByPriceId.get(row.id) ?? (row.playerId ? String(row.playerId) : null);
    if (!playerId || positionsByPlayerId.has(playerId)) continue;
    positionsByPlayerId.set(playerId, position);
  }

  return positionsByPlayerId;
}

export function sportsRuFantasyPriceRefsByScopedPlayer(priceRows: SportsRuScopedPriceRow[], priceMaps: SportsRuPositionMapRow[]) {
  const mappedPlayerIdsByPriceId = new Map(
    priceMaps
      .filter((row) => row.internalEntityId)
      .map((row) => [row.providerEntityId, row.internalEntityId as string])
  );
  const refsByScopedPlayer = new Map<string, SportsRuFantasyPriceRef>();

  for (const row of priceRows) {
    const playerId = mappedPlayerIdsByPriceId.get(row.id) ?? (row.playerId ? String(row.playerId) : null);
    if (!playerId) continue;

    for (const season of sportsRuSeasonAliases(row.season)) {
      const key = sportsRuFantasyPriceScopeKey(row.leagueId, season, playerId);
      if (refsByScopedPlayer.has(key)) continue;
      refsByScopedPlayer.set(key, {
        playerId,
        leagueId: String(row.leagueId),
        season,
        playerName: row.playerName,
        position: sportsRuPricePosition(row),
        price: row.price
      });
    }
  }

  return refsByScopedPlayer;
}

export function sportsRuFantasyPriceScopeKey(leagueId: string | number | bigint, season: string, playerId: string | number | bigint) {
  return `${leagueId}:${season}:${playerId}`;
}

export function sportsRuPricePosition(row: Pick<SportsRuPositionPriceRow, "position" | "positionLabel" | "sourceKind" | "sourceRowIndex">) {
  const directPosition = knownFantasyPosition(row.position);
  if (directPosition) return directPosition;

  const labelPosition = knownFantasyPosition(row.positionLabel);
  if (labelPosition) return labelPosition;

  if (row.sourceKind === "featured-field" && row.sourceRowIndex !== null && row.sourceRowIndex !== undefined) {
    return sportsRuFeaturedRowPosition(row.sourceRowIndex);
  }

  if (row.sourceKind === "featured-field-fallback" && row.sourceRowIndex !== null && row.sourceRowIndex !== undefined) {
    return sportsRuFeaturedIndexPosition(row.sourceRowIndex);
  }

  return null;
}

async function loadLegacyMacheteUpcomingRoundFixtures(prisma: PrismaClient, league: SharedLeagueSeasonOption, now: Date) {
  const macheteLeague = await prisma.macheteLeague.findFirst({
    where: {
      provider: "FOTMOB",
      providerLeagueId: String(league.leagueId),
      OR: [{ season: { in: sportsRuSeasonAliases(league.season) } }, { season: null }]
    }
  });
  if (!macheteLeague) return buildPlannerRoundFixtures([], now);

  const fixtures = await prisma.macheteFixture.findMany({
    where: {
      leagueId: macheteLeague.id,
      OR: [{ status: { notIn: ["FINISHED", "PLAYED", "CANCELLED", "POSTPONED"] } }, { kickoffAt: { gte: startOfTodayUtc(now) } }]
    },
    include: {
      homeTeam: { select: { providerTeamId: true, name: true, shortName: true } },
      awayTeam: { select: { providerTeamId: true, name: true, shortName: true } }
    },
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    take: 180
  });

  return buildPlannerRoundFixtures(
    fixtures.map((fixture) => ({
      id: fixture.providerFixtureId ?? fixture.id,
      round: fixture.round ?? null,
      matchDate: fixture.kickoffAt,
      homeTeamId: fixture.homeTeam?.providerTeamId ?? null,
      awayTeamId: fixture.awayTeam?.providerTeamId ?? null,
      homeTeamName: fixture.homeTeam?.shortName ?? fixture.homeTeam?.name ?? null,
      awayTeamName: fixture.awayTeam?.shortName ?? fixture.awayTeam?.name ?? null,
      homeTeamFullName: fixture.homeTeam?.name ?? null,
      awayTeamFullName: fixture.awayTeam?.name ?? null,
      finished: fixture.status === "FINISHED" || fixture.status === "PLAYED",
      cancelled: fixture.status === "CANCELLED" || fixture.status === "POSTPONED"
    })),
    now
  );
}

function groupMatchesByRound<T extends {
  id: string;
  round: string | null;
  matchDate: Date | null;
  providerRoundId?: string | null;
  providerRoundLabel?: string | null;
  providerRoundOrdinal?: number | null;
}>(matches: T[]) {
  const groups = new Map<string, { id: string; label: string; startsAt: Date | null; rank: number; matches: T[] }>();
  for (const match of matches) {
    const roundLabel = normalizeRoundLabel(match.round);
    const dateKey = match.matchDate ? match.matchDate.toISOString().slice(0, 10) : `fixture-${match.id}`;
    const id = match.providerRoundId ?? (roundLabel ? `round:${roundLabel}` : `date:${dateKey}`);
    const label = match.providerRoundLabel ?? (roundLabel ? `Round ${roundLabel}` : formatDate(match.matchDate));
    const existing = groups.get(id);
    if (existing) {
      existing.matches.push(match);
      if (dateMs(match.matchDate) < dateMs(existing.startsAt)) existing.startsAt = match.matchDate;
      continue;
    }

    groups.set(id, {
      id,
      label,
      startsAt: match.matchDate,
      rank: match.providerRoundOrdinal ?? (roundLabel ? Number(roundLabel) || dateMs(match.matchDate) : dateMs(match.matchDate)),
      matches: [match]
    });
  }

  return [...groups.values()].sort((left, right) => left.rank - right.rank || dateMs(left.startsAt) - dateMs(right.startsAt));
}

function addTeamFixture(map: Map<string, Map<string, PlannerFixture[]>>, roundId: string, fixture: PlannerFixture) {
  const roundMap = map.get(roundId) ?? new Map<string, PlannerFixture[]>();
  const fixtures = roundMap.get(fixture.teamId) ?? [];
  fixtures.push(fixture);
  roundMap.set(fixture.teamId, fixtures);
  map.set(roundId, roundMap);
}

function findOpponentTeamStat(match: TeamStrengthMatchInput, stat: TeamStrengthMatchInput["teamStats"][number]) {
  const opponentTeamId =
    stat.opponentTeamId ??
    (stat.teamId === match.homeTeamId ? match.awayTeamId : stat.teamId === match.awayTeamId ? match.homeTeamId : null);

  return (
    match.teamStats.find((candidate) => opponentTeamId && candidate.teamId === opponentTeamId) ??
    match.teamStats.find((candidate) => candidate.teamId !== stat.teamId) ??
    null
  );
}

function teamStatSide(match: TeamStrengthMatchInput, stat: TeamStrengthMatchInput["teamStats"][number]): TeamStrengthSide | null {
  if (stat.isHome === true) return "home";
  if (stat.isHome === false) return "away";
  if (stat.teamId === match.homeTeamId) return "home";
  if (stat.teamId === match.awayTeamId) return "away";
  return null;
}

function profileFromSamples(samples: TeamStrengthSample[], leaguePrior?: TeamStrengthProfile): TeamStrengthProfile {
  if (!leaguePrior) {
    return {
      home: strengthBlock(samples.filter((sample) => sample.side === "home")),
      away: strengthBlock(samples.filter((sample) => sample.side === "away")),
      overall: strengthBlock(samples)
    };
  }

  const overall = strengthBlock(samples, leaguePrior.overall, teamStrengthOverallPriorMatches);
  return {
    home: strengthBlock(
      samples.filter((sample) => sample.side === "home"),
      venueAdjustedStrengthPrior(overall, leaguePrior.home, leaguePrior.overall),
      teamStrengthVenuePriorMatches
    ),
    away: strengthBlock(
      samples.filter((sample) => sample.side === "away"),
      venueAdjustedStrengthPrior(overall, leaguePrior.away, leaguePrior.overall),
      teamStrengthVenuePriorMatches
    ),
    overall
  };
}

export function addPromotedTeamStrengthProfiles(topLeague: TeamStrengthProfiles, feederLeague: TeamStrengthProfiles): TeamStrengthProfiles {
  const byTeamId = new Map(topLeague.byTeamId);
  for (const [teamId, feederProfile] of feederLeague.byTeamId) {
    if (byTeamId.has(teamId) || !hasStrengthSignal(feederProfile.overall)) continue;
    byTeamId.set(teamId, {
      home: promotedStrengthBlock(feederProfile.home, feederLeague.league.home, topLeague.league.home),
      away: promotedStrengthBlock(feederProfile.away, feederLeague.league.away, topLeague.league.away),
      overall: promotedStrengthBlock(feederProfile.overall, feederLeague.league.overall, topLeague.league.overall)
    });
  }
  return { byTeamId, league: topLeague.league };
}

function promotedStrengthBlock(source: TeamStrengthBlock, feederAverage: TeamStrengthBlock, topAverage: TeamStrengthBlock): TeamStrengthBlock {
  const attackRatio = strengthRatio(source.xgForPerMatch, feederAverage.xgForPerMatch);
  const defenseRatio = strengthRatio(feederAverage.xgAgainstPerMatch, source.xgAgainstPerMatch);
  const adjustedAttack = promotedStrengthRatio(attackRatio, source.matches);
  const adjustedDefense = promotedStrengthRatio(defenseRatio, source.matches);
  return {
    matches: source.matches,
    xgForPerMatch: (topAverage.xgForPerMatch ?? defaultTeamXgPerMatch) * adjustedAttack,
    xgAgainstPerMatch: (topAverage.xgAgainstPerMatch ?? defaultTeamXgPerMatch) / adjustedDefense
  };
}

function promotedStrengthRatio(ratio: number, matches: number) {
  const sampleMatches = Math.max(0, matches);
  const shrunkRatio = (sampleMatches * ratio + promotedTeamPriorMatches) / (sampleMatches + promotedTeamPriorMatches);
  return promotedTeamStrengthFactor * shrunkRatio ** promotedTeamRatioExponent;
}

function strengthRatio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return 1;
  return clamp(numerator / denominator, 0.5, 2);
}

function strengthBlock(samples: TeamStrengthSample[], prior?: TeamStrengthBlock, priorMatches = 0): TeamStrengthBlock {
  return {
    matches: samples.length,
    xgForPerMatch: weightedStrengthAverage(samples, "xgFor", prior?.xgForPerMatch ?? null, priorMatches),
    xgAgainstPerMatch: weightedStrengthAverage(samples, "xgAgainst", prior?.xgAgainstPerMatch ?? null, priorMatches)
  };
}

function weightedStrengthAverage(
  samples: TeamStrengthSample[],
  field: "xgFor" | "xgAgainst",
  prior: number | null,
  priorMatches: number
) {
  const known = samples.filter((sample) => sample[field] !== null);
  const sampleWeight = sum(known.map((sample) => sample.weight));
  const priorWeight = prior !== null ? priorMatches : 0;
  if (sampleWeight + priorWeight <= 0) return null;
  return (sum(known.map((sample) => (sample[field] ?? 0) * sample.weight)) + (prior ?? 0) * priorWeight) / (sampleWeight + priorWeight);
}

function venueAdjustedStrengthPrior(overall: TeamStrengthBlock, leagueVenue: TeamStrengthBlock, leagueOverall: TeamStrengthBlock): TeamStrengthBlock {
  return {
    matches: 0,
    xgForPerMatch: venueAdjustedMetric(overall.xgForPerMatch, leagueVenue.xgForPerMatch, leagueOverall.xgForPerMatch),
    xgAgainstPerMatch: venueAdjustedMetric(overall.xgAgainstPerMatch, leagueVenue.xgAgainstPerMatch, leagueOverall.xgAgainstPerMatch)
  };
}

function venueAdjustedMetric(teamOverall: number | null, leagueVenue: number | null, leagueOverall: number | null) {
  if (teamOverall === null) return leagueVenue ?? leagueOverall;
  if (leagueVenue === null || leagueOverall === null || leagueOverall <= 0) return teamOverall;
  return teamOverall * (leagueVenue / leagueOverall);
}

function teamStrengthRecencyWeight(value: Date | string | null | undefined, referenceDateMs: number | null) {
  const valueMs = teamStrengthMatchDateMs(value);
  if (valueMs === null || referenceDateMs === null) return 1;
  const ageDays = Math.max(0, (referenceDateMs - valueMs) / 86_400_000);
  return 0.5 ** (ageDays / teamStrengthHalfLifeDays);
}

function teamStrengthMatchDateMs(value: Date | string | null | undefined) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function strengthBlockForSide(
  profile: TeamStrengthProfile | undefined,
  side: TeamStrengthSide | null,
  leagueProfile: TeamStrengthProfile
): TeamStrengthBlock {
  const preferred = side ? profile?.[side] : profile?.overall;
  if (preferred && hasStrengthSignal(preferred)) return preferred;
  if (profile?.overall && hasStrengthSignal(profile.overall)) return profile.overall;
  if (side && hasStrengthSignal(leagueProfile[side])) return leagueProfile[side];
  if (hasStrengthSignal(leagueProfile.overall)) return leagueProfile.overall;

  return {
    matches: 0,
    xgForPerMatch: defaultTeamXgPerMatch,
    xgAgainstPerMatch: defaultTeamXgPerMatch
  };
}

function hasStrengthSignal(block: TeamStrengthBlock) {
  return block.matches > 0 && (block.xgForPerMatch !== null || block.xgAgainstPerMatch !== null);
}

function ratioMultiplier(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return clamp(numerator / denominator, 0.72, 1.28);
}

function knownFantasyPosition(position: string | null | undefined) {
  const positionGroup = normalizeFantasyPosition(position);
  return positionGroup === "UNK" ? null : positionGroup;
}

function sportsRuFeaturedRowPosition(rowIndex: number) {
  if (rowIndex === 0) return "GK";
  if (rowIndex === 1) return "DEF";
  if (rowIndex === 2) return "MID";
  return "FWD";
}

function sportsRuFeaturedIndexPosition(index: number) {
  if (index === 0) return "GK";
  if (index <= 4) return "DEF";
  if (index <= 8) return "MID";
  return "FWD";
}

function sportsRuPriceScopes(scopes: SharedPlayerRowsScope[]) {
  const seen = new Set<string>();
  const priceScopes: Array<{ leagueId: bigint; season: string }> = [];

  for (const scope of scopes) {
    if (!scope.leagueId || !scope.season) continue;
    for (const season of sportsRuSeasonAliases(scope.season)) {
      const key = `${scope.leagueId}:${season}`;
      if (seen.has(key)) continue;
      seen.add(key);
      priceScopes.push({ leagueId: scope.leagueId, season });
    }
  }

  return priceScopes;
}

export function sportsRuAuthoritativeRosterOverrides(
  priceRows: SportsRuRosterPriceRow[],
  priceMaps: SportsRuPositionMapRow[],
  league: Pick<SharedLeagueSeasonOption, "leagueId" | "season" | "name" | "country">,
  requestedPlayerIds?: bigint[]
): SharedRosterOverride[] {
  const mappedPlayerIdsByPriceId = new Map(
    priceMaps
      .filter((row) => row.internalEntityId)
      .map((row) => [row.providerEntityId, row.internalEntityId as string])
  );
  const requested = requestedPlayerIds === undefined ? null : new Set(requestedPlayerIds.map(String));
  const acceptedSeasons = new Set(sportsRuSeasonAliases(league.season));
  const seenPlayerIds = new Set<string>();
  const overrides: SharedRosterOverride[] = [];

  for (const row of priceRows) {
    if (row.leagueId !== league.leagueId || !acceptedSeasons.has(row.season) || !row.teamId || !row.team || !row.player) continue;
    const mappedPlayerId = mappedPlayerIdsByPriceId.get(row.id) ?? null;
    if (!mappedPlayerId || String(row.player.id) !== mappedPlayerId || (requested && !requested.has(mappedPlayerId))) continue;
    if (seenPlayerIds.has(mappedPlayerId)) continue;
    seenPlayerIds.add(mappedPlayerId);
    overrides.push({
      leagueId: league.leagueId,
      season: league.season,
      teamId: row.teamId,
      playerId: row.player.id,
      position: sportsRuPricePosition(row),
      playerName: row.player.name,
      playerCountry: row.player.country,
      teamName: row.team.name,
      leagueName: league.name,
      leagueCountry: league.country
    });
  }

  return overrides;
}

export async function loadSportsRuAuthoritativeRosterContext(
  prisma: PrismaClient,
  league: Pick<SharedLeagueSeasonOption, "leagueId" | "season" | "name" | "country">,
  requestedPlayerIds?: bigint[],
  contestId?: string | null
) {
  const resolvedContestId = contestId ?? (await fantasyContestClient(prisma).findFirst({
    where: {
      provider: "SPORTS_RU",
      leagueId: league.leagueId,
      season: { in: sportsRuSeasonAliases(league.season) }
    },
    orderBy: { lastSyncedAt: "desc" },
    select: { id: true }
  }))?.id ?? "__missing_sports_ru_contest__";
  const priceRows = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: "SPORTS_RU",
      contestId: resolvedContestId,
      leagueId: league.leagueId,
      season: { in: sportsRuSeasonAliases(league.season) }
    },
    include: {
      player: true,
      team: true
    },
    orderBy: { lastSeenAt: "desc" }
  });
  const priceMaps = priceRows.length > 0
    ? await prisma.providerEntityMap.findMany({
        where: {
          provider: "SPORTS_RU",
          contestId: resolvedContestId,
          providerSeason: { in: sportsRuSeasonAliases(league.season) },
          providerEntityType: "FANTASY_PLAYER_PRICE",
          providerEntityId: { in: priceRows.map((row) => row.id) },
          internalEntityType: "PLAYER",
          internalEntityId: { not: null },
          status: "MATCHED"
        },
        select: {
          providerEntityId: true,
          internalEntityId: true
        }
      })
    : [];

  return {
    priceRows,
    priceMaps,
    rosterOverrides: sportsRuAuthoritativeRosterOverrides(priceRows, priceMaps, league, requestedPlayerIds)
  };
}

export function applySportsRuRosterOverrides(
  rosterRows: FantasyPlannerRosterRow[],
  overrides: SharedRosterOverride[]
): FantasyPlannerRosterRow[] {
  if (overrides.length === 0) return rosterRows;

  const overridesByPlayer = new Map(
    overrides.map((override) => [playerScopeKey(override.leagueId, override.season, override.playerId), override])
  );
  const sourceByPlayer = new Map<string, FantasyPlannerRosterRow>();
  for (const row of rosterRows) {
    const key = playerScopeKey(row.leagueId, row.season, row.playerId);
    const override = overridesByPlayer.get(key);
    const current = sourceByPlayer.get(key);
    if (!current || (override && row.teamId === override.teamId)) sourceByPlayer.set(key, row);
  }

  const effectiveRows = rosterRows.filter((row) =>
    !overridesByPlayer.has(playerScopeKey(row.leagueId, row.season, row.playerId))
  );
  for (const [key, override] of overridesByPlayer) {
    const source = sourceByPlayer.get(key);
    effectiveRows.push({
      leagueId: override.leagueId,
      season: override.season,
      teamId: override.teamId,
      playerId: override.playerId,
      position: override.position ?? source?.position ?? null,
      age: source?.age ?? override.age ?? null,
      nationality: source?.nationality ?? override.nationality ?? override.playerCountry,
      photoUrl: source?.photoUrl ?? override.photoUrl ?? null,
      isStarter: source?.isStarter ?? override.isStarter ?? false,
      player: { name: override.playerName },
      team: { name: override.teamName }
    });
  }
  return effectiveRows;
}

function playerScopeKey(leagueId: bigint, season: string, playerId: bigint) {
  return `${leagueId}:${season}:${playerId}`;
}

function priceLookup(
  priceRows: Array<{
    id: string;
    playerId: bigint | null;
    playerName: string;
    normalizedName: string;
    teamName: string;
    position: string | null;
    positionLabel?: string | null;
    sourceKind?: string | null;
    sourceRowIndex?: number | null;
    price: number;
  }>,
  priceMaps: Array<{
    providerEntityId: string;
    internalEntityId: string | null;
  }>
) {
  const mappedPlayerIdsByPriceId = new Map(
    priceMaps
      .filter((row) => row.internalEntityId)
      .map((row) => [row.providerEntityId, row.internalEntityId as string])
  );
  const byPlayerId = new Map<string, (typeof priceRows)[number]>();
  for (const row of priceRows) {
    const mappedPlayerId = mappedPlayerIdsByPriceId.get(row.id);
    if (mappedPlayerId) {
      if (!byPlayerId.has(mappedPlayerId)) byPlayerId.set(mappedPlayerId, row);
    } else if (row.playerId) {
      const playerId = String(row.playerId);
      if (!byPlayerId.has(playerId)) byPlayerId.set(playerId, row);
    }
  }
  return {
    byPlayerId
  };
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

export function resolveFantasyPlannerPrice(
  priceRow: { price: number } | null | undefined,
  score: number | null,
  positionGroup: FantasyPositionGroup,
  provider = "SPORTS_RU"
): Pick<FantasyPlannerPlayer, "price" | "priceSource"> {
  if (priceRow) return { price: priceRow.price, priceSource: provider === FPL_PROVIDER ? "FPL" : "SPORTS_RU" };

  return {
    price: estimateFantasyPrice(score, positionGroup),
    priceSource: "ESTIMATED"
  };
}

function estimateFantasyPrice(score: number | null, positionGroup: FantasyPositionGroup) {
  const safeScore = Math.max(0, score ?? 0);
  const base = positionGroup === "GK" ? 4.5 : positionGroup === "DEF" ? 4.5 : positionGroup === "MID" ? 5 : 5.5;
  const multiplier = positionGroup === "GK" ? 0.28 : positionGroup === "DEF" ? 0.38 : positionGroup === "MID" ? 0.48 : 0.55;
  return Math.min(13.5, Math.max(3.5, roundFantasyValue(base + safeScore * multiplier)));
}

function fixtureMultiplier(fixture: FantasyFixtureProjection, positionGroup: FantasyPositionGroup) {
  const attack = fixture.attackMultiplier ?? 1;
  const defense = fixture.defenseMultiplier ?? 1;
  const weights = fixtureSignalWeights(positionGroup);
  const positionBlend = 1 + (attack - 1) * weights.attack + (defense - 1) * weights.defense;

  return clamp(positionBlend, 0.68, 1.35);
}

export function fantasyTeamShortName(metadata: unknown, fallback: string) {
  return providerTeamShortName({ metadata }) ?? fallback;
}

export function fantasyTeamShortNamesByTeamId(
  selectedSeasonTeams: Array<{ teamId: bigint; metadata: unknown }>,
  fallbackSeasonTeams: Array<{ teamId: bigint; metadata: unknown }>
) {
  const result = new Map<string, string>();
  for (const row of [...selectedSeasonTeams, ...fallbackSeasonTeams]) {
    const teamId = String(row.teamId);
    if (result.has(teamId)) continue;
    const shortName = providerTeamShortName({ metadata: row.metadata });
    if (shortName) result.set(teamId, shortName);
  }
  return result;
}

export function compareFantasyPlannerPlayers(left: FantasyPlannerPlayer, right: FantasyPlannerPlayer) {
  return (
    (right.roundPoints[0] ?? right.predictedFp ?? 0) - (left.roundPoints[0] ?? left.predictedFp ?? 0) ||
    priceSourceRank(right.priceSource) - priceSourceRank(left.priceSource) ||
    right.valueScore - left.valueScore ||
    left.name.localeCompare(right.name)
  );
}

function priceSourceRank(source: FantasyPlannerPlayer["priceSource"]) {
  return source === "SPORTS_RU" || source === FPL_PROVIDER ? 1 : 0;
}

function playerTeamKey(playerId: string | number | bigint, teamId: string | number | bigint) {
  return `${playerId}:${teamId}`;
}

function isTopFiveLeague(league: Pick<SharedLeagueSeasonOption, "leagueId" | "name" | "displayName" | "country">) {
  const name = `${league.name} ${league.displayName} ${league.country ?? ""}`.toLowerCase();
  return (
    String(league.leagueId) === "47" ||
    ["premier league", "la liga", "bundesliga", "serie a", "ligue 1"].some((candidate) => name.includes(candidate))
  );
}

function normalizeRoundLabel(value: string | null) {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match?.[0] ?? value.trim();
}

function stringifyBigInt(value: bigint | null | undefined) {
  return value === null || value === undefined ? null : String(value);
}

function dateMs(value: Date | null) {
  return value?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function startOfTodayUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function sportsRuSeasonAliases(season: string) {
  const values = new Set([season]);
  const long = season.match(/^(\d{4})\/(\d{4})$/);
  if (long) values.add(`${long[1]}/${long[2].slice(-2)}`);
  const short = season.match(/^(\d{4})\/(\d{2})$/);
  if (short) values.add(`${short[1]}/20${short[2]}`);
  return [...values];
}

export function displayLeagueName(league: SharedLeagueSeasonOption) {
  return macheteLeagueDisplayName({
    id: league.providerLeagueId,
    name: league.name,
    country: league.country,
    providerLeagueId: league.providerLeagueId
  });
}

function numericOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}

function averageKnown(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (known.length === 0) return null;
  return sum(known) / known.length;
}

function expectedFormulaUsesBookmaker(model: ActiveScoringModel, position: FantasyPositionGroup) {
  if (!model.customFormulaEnabled) return false;
  const positionFormula = position === "GK"
    ? model.customFormulaGk
    : position === "DEF"
      ? model.customFormulaDef
      : position === "MID"
        ? model.customFormulaMid
        : position === "FWD"
          ? model.customFormulaFwd
          : null;
  const formula = positionFormula?.trim() || model.customFormula?.trim() || "";
  const normalized = formula.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return normalized.includes("fixture_team_over_1_5_probability") || normalized.includes("fixture_clean_sheet_probability");
}

function poissonOver15Probability(projectedXg: number | null) {
  if (projectedXg === null || !Number.isFinite(projectedXg) || projectedXg < 0) return null;
  return 1 - Math.exp(-projectedXg) * (1 + projectedXg);
}

function poissonCleanSheetProbability(projectedXga: number | null) {
  if (projectedXga === null || !Number.isFinite(projectedXga) || projectedXga < 0) return null;
  return Math.exp(-projectedXga);
}

function relativeProbabilitySignal(actual: number | null | undefined, baseline: number | null) {
  if (actual === null || actual === undefined || !Number.isFinite(actual) || baseline === null || baseline <= 0) return 1;
  return clamp(actual / baseline, 0.8, 1.2);
}

function bookmakerSignalWeights(position: FantasyPositionGroup) {
  if (position === "GK" || position === "DEF") return { attack: 0.1, defense: 0.55 };
  if (position === "MID") return { attack: 0.45, defense: 0.15 };
  if (position === "FWD") return { attack: 0.6, defense: 0.05 };
  return { attack: 0.25, defense: 0.25 };
}

function fixtureSignalWeights(position: FantasyPositionGroup) {
  if (position === "GK" || position === "DEF") return { attack: 0.12, defense: 0.42 };
  if (position === "MID") return { attack: 0.32, defense: 0.12 };
  if (position === "FWD") return { attack: 0.48, defense: 0 };
  return { attack: 0.24, defense: 0.12 };
}

export function fixtureOddsAreFresh(fetchedAt: Date | null | undefined, now = new Date()) {
  if (!fetchedAt) return false;
  const ageMs = now.getTime() - fetchedAt.getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= fixtureOddsMaximumAgeMs;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
