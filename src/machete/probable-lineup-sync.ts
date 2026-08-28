import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  assertCompleteProbableLineupPage,
  FANTASY_COACH_LIGUE_1_API_URL,
  FANTASY_COACH_LIGUE_1_URL,
  FANTASY_FOOTBALL_SCOUT_LINEUPS_URL,
  GAZZETTA_PROBABLE_LINEUPS_URL,
  LIGAINSIDER_BUNDESLIGA_URL,
  normalizeLineupIdentity,
  parseFantasyCoachAvailableGameweeks,
  parseFantasyCoachLigue1Lineups,
  parseFantasyFootballScoutLineups,
  parseGazzettaProbableLineups,
  parseLigaInsiderTeamDirectory,
  parseLigaInsiderTeamLineup,
  ProbableLineupParseError,
  type ParsedProbableLineupPage,
  type LigaInsiderTeamPage,
  type ProbableLineupPlayer,
  type ProbableLineupSource,
  type ProbableTeamLineup
} from "./probable-lineup-parsers";
import { normalizeFantasyPosition } from "./squad_logic";

const EXPECTED_PLAYERS_PER_TEAM = 11;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LIGAINSIDER_REQUEST_INTERVAL_MS = 500;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const PLAYER_MATCH_THRESHOLD = 0.88;
const PLAYER_AMBIGUITY_GAP = 0.025;
const TEAM_MATCH_THRESHOLD = 0.9;
const TEAM_AMBIGUITY_GAP = 0.04;

class NonRetryableProbableLineupError extends Error {}

export type ProbableLineupSourceKey = "epl" | "serie-a" | "bundesliga" | "ligue-1";

export type ProbableLineupFetchMode = "SINGLE_PAGE" | "LIGAINSIDER_TEAM_PAGES" | "FANTASY_COACH_LATEST_GAMEWEEK";

export type ProbableLineupSourceDefinition = {
  key: ProbableLineupSourceKey;
  label: string;
  source: ProbableLineupSource;
  sourceUrl: string;
  leagueId: bigint;
  expectedTeams: number;
  fetchMode: ProbableLineupFetchMode;
  parse: ((html: string) => ParsedProbableLineupPage) | null;
};

export const PROBABLE_LINEUP_SOURCE_DEFINITIONS: readonly ProbableLineupSourceDefinition[] = [
  {
    key: "epl",
    label: "Premier League / Fantasy Football Scout",
    source: "FANTASY_FOOTBALL_SCOUT",
    sourceUrl: FANTASY_FOOTBALL_SCOUT_LINEUPS_URL,
    leagueId: 47n,
    expectedTeams: 20,
    fetchMode: "SINGLE_PAGE",
    parse: parseFantasyFootballScoutLineups
  },
  {
    key: "serie-a",
    label: "Serie A / Gazzetta",
    source: "GAZZETTA",
    sourceUrl: GAZZETTA_PROBABLE_LINEUPS_URL,
    leagueId: 55n,
    expectedTeams: 20,
    fetchMode: "SINGLE_PAGE",
    parse: parseGazzettaProbableLineups
  },
  {
    key: "bundesliga",
    label: "Bundesliga / LigaInsider",
    source: "LIGAINSIDER",
    sourceUrl: LIGAINSIDER_BUNDESLIGA_URL,
    leagueId: 54n,
    expectedTeams: 18,
    fetchMode: "LIGAINSIDER_TEAM_PAGES",
    parse: null
  },
  {
    key: "ligue-1",
    label: "Ligue 1 / Fantasy Coach",
    source: "FANTASY_COACH_LIGUE_1",
    sourceUrl: FANTASY_COACH_LIGUE_1_URL,
    leagueId: 53n,
    expectedTeams: 18,
    fetchMode: "FANTASY_COACH_LATEST_GAMEWEEK",
    parse: null
  }
];

export type ProbableLineupFetchOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  requestIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

type ResolvedProbableLineupFetchOptions = {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  maxAttempts: number;
  requestIntervalMs: number;
  sleep: (milliseconds: number) => Promise<void>;
};

export type ProbableLineupRosterPlayer = {
  playerId: bigint;
  name: string;
  position: string | null;
  shirtNumber: number | null;
  isStarter: boolean;
};

export type ProbableLineupPlayerResolution = {
  sourcePlayer: ProbableLineupPlayer;
  playerId: bigint | null;
  playerName: string | null;
  confidence: number;
  matchedBy: "PROVIDER_CODE" | "NAME" | null;
  alternatives: Array<{ playerId: bigint; playerName: string; confidence: number }>;
  reason: "MATCHED" | "NO_MATCH" | "AMBIGUOUS" | "PROVIDER_PLAYER_NOT_IN_ROSTER";
};

export type ProbableLineupTeamPlanStatus = "READY" | "UNCHANGED" | "TEAM_UNMATCHED" | "PLAYERS_UNMATCHED";

export type ProbableLineupTeamPlan = {
  source: ProbableLineupSource;
  sourceUrl: string;
  leagueId: bigint;
  leagueName: string;
  season: string;
  fetchedAt: Date;
  sourceLineup: ProbableTeamLineup;
  teamId: bigint | null;
  databaseTeamName: string | null;
  teamMatchedBy: "PROVIDER_CODE" | "NAME" | null;
  teamConfidence: number;
  status: ProbableLineupTeamPlanStatus;
  playerResolutions: ProbableLineupPlayerResolution[];
  currentStarterIds: bigint[];
  targetPlayerIds: bigint[];
  startersToSet: number;
  startersToClear: number;
  problems: string[];
};

export type ProbableLineupSyncPlan = {
  sourceDefinition: ProbableLineupSourceDefinition;
  leagueName: string;
  season: string;
  fetchedAt: Date;
  parsedTeams: number;
  teams: ProbableLineupTeamPlan[];
};

export type ProbableLineupApplyResult = {
  teamId: bigint;
  teamName: string;
  status: "APPLIED" | "UNCHANGED";
  startersSet: number;
  startersCleared: number;
  otherTeamFlagsCleared: number;
};

type ActiveTeam = {
  teamId: bigint;
  team: { name: string };
  players: Array<{
    playerId: bigint;
    active: boolean;
    position: string | null;
    shirtNumber: number | null;
    isStarter: boolean;
    player: { name: string };
  }>;
};

type ProviderCodeMaps = {
  teams: Map<string, bigint>;
  players: Map<string, bigint>;
};

export async function fetchProbableLineupPage(
  definition: ProbableLineupSourceDefinition,
  options: ProbableLineupFetchOptions = {}
) {
  const resolvedOptions: ResolvedProbableLineupFetchOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS),
    maxAttempts: positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS),
    requestIntervalMs: nonNegativeInteger(options.requestIntervalMs, DEFAULT_LIGAINSIDER_REQUEST_INTERVAL_MS),
    sleep: options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  };

  if (definition.fetchMode === "LIGAINSIDER_TEAM_PAGES") {
    return fetchLigaInsiderLineupPage(definition, resolvedOptions);
  }
  if (definition.fetchMode === "FANTASY_COACH_LATEST_GAMEWEEK") {
    return fetchFantasyCoachLigue1LineupPage(definition, resolvedOptions);
  }
  if (!definition.parse) {
    throw new Error(`${definition.label} does not define a parser for ${definition.fetchMode}.`);
  }

  return fetchParsedProbableLineupResource(
    definition.sourceUrl,
    definition.label,
    definition,
    resolvedOptions,
    (html) => {
      const page = definition.parse?.(html);
      if (!page) throw new Error(`${definition.label} parser returned no page.`);
      assertCompleteProbableLineupPage(page, {
        expectedTeams: definition.expectedTeams,
        expectedPlayersPerTeam: EXPECTED_PLAYERS_PER_TEAM
      });
      return page;
    }
  );
}

async function fetchFantasyCoachLigue1LineupPage(
  definition: ProbableLineupSourceDefinition,
  options: ResolvedProbableLineupFetchOptions
) {
  if (definition.source !== "FANTASY_COACH_LIGUE_1") {
    throw new Error(`${definition.label} uses the Fantasy Coach fetch mode with source ${definition.source}.`);
  }
  const metaUrl = fantasyCoachApiUrl("meta", "1");
  const gameweeks = await fetchParsedProbableLineupResource(
    metaUrl,
    `${definition.label} gameweek metadata`,
    definition,
    options,
    parseFantasyCoachAvailableGameweeks,
    JSON_RESOURCE_OPTIONS
  );
  const gameweek = gameweeks.at(-1);
  if (gameweek === undefined) throw new Error(`${definition.label} returned no gameweek.`);
  const lineupUrl = fantasyCoachApiUrl("journee", String(gameweek));
  return fetchParsedProbableLineupResource(
    lineupUrl,
    `${definition.label} gameweek ${gameweek}`,
    definition,
    options,
    (payload) => {
      const page = parseFantasyCoachLigue1Lineups(payload, gameweek, lineupUrl);
      assertCompleteProbableLineupPage(page, {
        expectedTeams: definition.expectedTeams,
        expectedPlayersPerTeam: EXPECTED_PLAYERS_PER_TEAM
      });
      return page;
    },
    JSON_RESOURCE_OPTIONS
  );
}

async function fetchLigaInsiderLineupPage(
  definition: ProbableLineupSourceDefinition,
  options: ResolvedProbableLineupFetchOptions
) {
  if (definition.source !== "LIGAINSIDER") {
    throw new Error(`${definition.label} uses the LigaInsider fetch mode with source ${definition.source}.`);
  }

  const teamPages = await fetchParsedProbableLineupResource(
    definition.sourceUrl,
    `${definition.label} team directory`,
    definition,
    options,
    (html) => {
      const parsed = parseLigaInsiderTeamDirectory(html, definition.sourceUrl);
      assertCompleteLigaInsiderDirectory(parsed, definition.expectedTeams);
      return parsed;
    }
  );
  const lineups: ProbableTeamLineup[] = [];

  for (const teamPage of teamPages) {
    if (options.requestIntervalMs > 0) await options.sleep(options.requestIntervalMs);
    const lineup = await fetchParsedProbableLineupResource(
      teamPage.sourceUrl,
      `${definition.label} / ${teamPage.teamName}`,
      definition,
      options,
      (html) => {
        const parsed = parseLigaInsiderTeamLineup(html, teamPage);
        assertCompleteProbableLineupPage({
          source: "LIGAINSIDER",
          sourceUrl: teamPage.sourceUrl,
          lineups: [parsed]
        }, {
          expectedTeams: 1,
          expectedPlayersPerTeam: EXPECTED_PLAYERS_PER_TEAM
        });
        return parsed;
      }
    );
    lineups.push(lineup);
  }

  const page: ParsedProbableLineupPage = {
    source: "LIGAINSIDER",
    sourceUrl: definition.sourceUrl,
    lineups
  };
  assertCompleteProbableLineupPage(page, {
    expectedTeams: definition.expectedTeams,
    expectedPlayersPerTeam: EXPECTED_PLAYERS_PER_TEAM
  });
  return page;
}

async function fetchParsedProbableLineupResource<T>(
  url: string,
  label: string,
  definition: ProbableLineupSourceDefinition,
  options: ResolvedProbableLineupFetchOptions,
  parseBody: (body: string) => T,
  resourceOptions: {
    accept: string;
    acceptedContentTypes: readonly string[];
  } = HTML_RESOURCE_OPTIONS
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await options.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: resourceOptions.accept,
          "accept-language": probableLineupAcceptLanguage(definition.source),
          "user-agent": "FantasyScoutProbableLineups/0.3 (+local admin sync)"
        },
        redirect: "follow",
        signal: controller.signal
      });
      if (!response.ok) {
        const error = retryableStatus(response.status)
          ? new Error(`${label} returned HTTP ${response.status}.`)
          : new NonRetryableProbableLineupError(`${label} returned HTTP ${response.status}.`);
        lastError = error;
        if (!retryableStatus(response.status) || attempt === options.maxAttempts - 1) throw error;
        await options.sleep(retryDelay(attempt));
        continue;
      }
      const contentType = response.headers.get("content-type")?.toLocaleLowerCase("en") ?? "";
      if (contentType && !resourceOptions.acceptedContentTypes.some((acceptedType) => contentType.includes(acceptedType))) {
        throw new Error(`${label} returned unexpected content type '${contentType}'.`);
      }
      const body = await responseTextWithLimit(response, MAX_RESPONSE_BYTES);
      return parseBody(body);
    } catch (error) {
      lastError = controller.signal.aborted
        ? new Error(`${label} timed out after ${options.timeoutMs} ms.`)
        : error;
      if (error instanceof NonRetryableProbableLineupError) throw error;
      if (attempt === options.maxAttempts - 1) throw lastError;
      await options.sleep(retryDelay(attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} could not be fetched.`);
}

const HTML_RESOURCE_OPTIONS = {
  accept: "text/html,application/xhtml+xml",
  acceptedContentTypes: ["text/html", "application/xhtml+xml"]
} as const;

const JSON_RESOURCE_OPTIONS = {
  accept: "application/json,text/plain;q=0.9,*/*;q=0.1",
  acceptedContentTypes: ["application/json", "text/plain"]
} as const;

function fantasyCoachApiUrl(parameter: "meta" | "journee", value: string) {
  const url = new URL(FANTASY_COACH_LIGUE_1_API_URL);
  url.searchParams.set(parameter, value);
  return url.toString();
}

function assertCompleteLigaInsiderDirectory(teamPages: LigaInsiderTeamPage[], expectedTeams: number) {
  const issues: string[] = [];
  if (teamPages.length !== expectedTeams) issues.push(`expected ${expectedTeams} team URLs, parsed ${teamPages.length}`);
  if (new Set(teamPages.map((team) => team.sourceTeamCode)).size !== teamPages.length) issues.push("duplicate team codes were parsed");
  if (new Set(teamPages.map((team) => team.sourceUrl)).size !== teamPages.length) issues.push("duplicate team URLs were parsed");
  if (new Set(teamPages.map((team) => normalizeLineupIdentity(team.teamName))).size !== teamPages.length) {
    issues.push("duplicate team names were parsed");
  }
  if (issues.length > 0) {
    throw new ProbableLineupParseError(`LIGAINSIDER directory failed completeness checks: ${issues.join("; ")}.`);
  }
}

function probableLineupAcceptLanguage(source: ProbableLineupSource) {
  if (source === "GAZZETTA") return "it-IT,it;q=0.9,en;q=0.6";
  if (source === "LIGAINSIDER") return "de-DE,de;q=0.9,en;q=0.6";
  if (source === "FANTASY_COACH_LIGUE_1") return "fr-FR,fr;q=0.9,en;q=0.6";
  return "en-GB,en;q=0.9";
}

export async function buildProbableLineupSyncPlan(
  prisma: PrismaClient,
  input: {
    definition: ProbableLineupSourceDefinition;
    page: ParsedProbableLineupPage;
    season?: string | null;
    fetchedAt?: Date;
  }
): Promise<ProbableLineupSyncPlan> {
  if (input.page.source !== input.definition.source) {
    throw new Error(`Parsed source ${input.page.source} does not match ${input.definition.source}.`);
  }
  assertCompleteProbableLineupPage(input.page, {
    expectedTeams: input.definition.expectedTeams,
    expectedPlayersPerTeam: EXPECTED_PLAYERS_PER_TEAM
  });

  const leagueSeason = await prisma.leagueSeason.findFirst({
    where: {
      leagueId: input.definition.leagueId,
      ...(input.season ? { season: input.season } : { isCurrent: true })
    },
    orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }],
    select: {
      leagueId: true,
      season: true,
      league: { select: { name: true } },
      teams: {
        where: { active: true },
        select: {
          teamId: true,
          team: { select: { name: true } },
          players: {
            select: {
              playerId: true,
              active: true,
              position: true,
              shirtNumber: true,
              isStarter: true,
              player: { select: { name: true } }
            }
          }
        }
      }
    }
  });
  if (!leagueSeason) {
    const seasonSuffix = input.season ? ` and season '${input.season}'` : " with isCurrent=true";
    throw new Error(`No league-season found for league ${input.definition.leagueId}${seasonSuffix}.`);
  }
  if (leagueSeason.teams.length === 0) {
    throw new Error(`League ${leagueSeason.league.name} ${leagueSeason.season} has no active teams.`);
  }

  const providerCodeMaps = input.definition.source === "FANTASY_FOOTBALL_SCOUT"
    ? await loadFplProviderCodeMaps(prisma, leagueSeason.season, input.page)
    : emptyProviderCodeMaps();
  const fetchedAt = input.fetchedAt ?? new Date();
  const rawTeamPlans = input.page.lineups.map((sourceLineup) => buildTeamPlan({
    sourceLineup,
    leagueId: leagueSeason.leagueId,
    leagueName: leagueSeason.league.name,
    season: leagueSeason.season,
    fetchedAt,
    activeTeams: leagueSeason.teams,
    providerCodeMaps
  }));
  const duplicatedTeamIds = duplicateBigIntValues(rawTeamPlans.flatMap((team) => team.teamId === null ? [] : [team.teamId]));
  const teams = rawTeamPlans.map((team) => team.teamId !== null && duplicatedTeamIds.has(String(team.teamId))
    ? {
        ...team,
        teamId: null,
        databaseTeamName: null,
        teamMatchedBy: null,
        status: "TEAM_UNMATCHED" as const,
        targetPlayerIds: [],
        startersToSet: 0,
        startersToClear: 0,
        problems: [...team.problems, "Multiple source teams resolved to the same database team."]
      }
    : team);

  return {
    sourceDefinition: input.definition,
    leagueName: leagueSeason.league.name,
    season: leagueSeason.season,
    fetchedAt,
    parsedTeams: input.page.lineups.length,
    teams
  };
}

export function resolveProbableLineupPlayer(
  sourcePlayer: ProbableLineupPlayer,
  roster: readonly ProbableLineupRosterPlayer[],
  providerMappedPlayerId: bigint | null = null
): ProbableLineupPlayerResolution {
  if (providerMappedPlayerId !== null) {
    const providerCandidate = roster.find((candidate) => candidate.playerId === providerMappedPlayerId);
    if (providerCandidate) {
      return matchedPlayer(sourcePlayer, providerCandidate, 1, "PROVIDER_CODE", []);
    }
  }

  const ranked = roster
    .map((candidate) => ({
      candidate,
      confidence: probableLineupPlayerScore(sourcePlayer, candidate)
    }))
    .filter((entry) => entry.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence || left.candidate.name.localeCompare(right.candidate.name));
  const alternatives = ranked.slice(0, 3).map((entry) => ({
    playerId: entry.candidate.playerId,
    playerName: entry.candidate.name,
    confidence: entry.confidence
  }));
  const best = ranked[0];
  if (!best || best.confidence < PLAYER_MATCH_THRESHOLD) {
    return {
      sourcePlayer,
      playerId: null,
      playerName: null,
      confidence: best?.confidence ?? 0,
      matchedBy: null,
      alternatives,
      reason: providerMappedPlayerId === null ? "NO_MATCH" : "PROVIDER_PLAYER_NOT_IN_ROSTER"
    };
  }
  const second = ranked[1];
  if (second && best.confidence - second.confidence < PLAYER_AMBIGUITY_GAP) {
    return {
      sourcePlayer,
      playerId: null,
      playerName: null,
      confidence: best.confidence,
      matchedBy: null,
      alternatives,
      reason: "AMBIGUOUS"
    };
  }
  return matchedPlayer(sourcePlayer, best.candidate, best.confidence, "NAME", alternatives);
}

export function probableLineupPlayerScore(
  sourcePlayer: Pick<ProbableLineupPlayer, "name" | "fullName" | "shirtNumber">,
  candidate: Pick<ProbableLineupRosterPlayer, "name" | "shirtNumber">
) {
  const sourceNames = [...new Set([sourcePlayer.fullName, sourcePlayer.name]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeLineupIdentity)
    .filter(Boolean))];
  const candidateName = normalizeLineupIdentity(candidate.name);
  let score = Math.max(0, ...sourceNames.map((sourceName) => normalizedPlayerNameScore(sourceName, candidateName)));
  if (sourcePlayer.shirtNumber !== null && candidate.shirtNumber === sourcePlayer.shirtNumber && score >= 0.65) {
    score = Math.min(0.99, score + 0.06);
  }
  return roundedConfidence(score);
}

export async function applyProbableLineupTeamPlan(
  prisma: PrismaClient,
  plan: ProbableLineupTeamPlan,
  appliedAt = new Date()
): Promise<ProbableLineupApplyResult> {
  if (!plan.teamId || !plan.databaseTeamName || (plan.status !== "READY" && plan.status !== "UNCHANGED")) {
    throw new Error(`${plan.sourceLineup.teamName} is not eligible for probable-lineup application (${plan.status}).`);
  }
  if (new Set(plan.targetPlayerIds.map(String)).size !== EXPECTED_PLAYERS_PER_TEAM) {
    throw new Error(`${plan.sourceLineup.teamName} does not have ${EXPECTED_PLAYERS_PER_TEAM} unique target players.`);
  }
  const teamId = plan.teamId;
  const teamName = plan.databaseTeamName;

  return prisma.$transaction(async (tx) => {
    const lockKey = `starting-xi:${plan.leagueId}:${plan.season}:${teamId}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const seasonTeam = await tx.leagueSeasonTeam.findUnique({
      where: {
        leagueId_season_teamId: {
          leagueId: plan.leagueId,
          season: plan.season,
          teamId
        }
      },
      select: { active: true, metadata: true }
    });
    if (!seasonTeam?.active) throw new Error(`${teamName} is no longer active in ${plan.season}.`);

    const rosterRows = await tx.teamPlayerSeason.findMany({
      where: { leagueId: plan.leagueId, season: plan.season, teamId },
      select: { playerId: true, active: true, isStarter: true, position: true }
    });
    const activeRoster = rosterRows.filter((row) => row.active);
    const activePlayerIds = new Set(activeRoster.map((row) => String(row.playerId)));
    const missingTargets = plan.targetPlayerIds.filter((playerId) => !activePlayerIds.has(String(playerId)));
    if (missingTargets.length > 0) {
      throw new Error(`${teamName} roster changed after planning; ${missingTargets.length} target player(s) are no longer active.`);
    }
    const targetRoster = plan.targetPlayerIds.map((playerId) => activeRoster.find((row) => row.playerId === playerId));
    const goalkeeperCount = targetRoster.filter((row) => normalizeFantasyPosition(row?.position) === "GK").length;
    if (goalkeeperCount !== 1 || normalizeFantasyPosition(targetRoster[0]?.position) !== "GK") {
      throw new Error(`${teamName} target lineup must contain one goalkeeper in the first source position.`);
    }
    const currentStarterIds = rosterRows.filter((row) => row.isStarter).map((row) => row.playerId);
    if (sameBigIntSet(currentStarterIds, plan.targetPlayerIds)) {
      return {
        teamId,
        teamName,
        status: "UNCHANGED",
        startersSet: 0,
        startersCleared: 0,
        otherTeamFlagsCleared: 0
      };
    }

    const otherFlaggedTeams = await tx.teamPlayerSeason.findMany({
      where: {
        leagueId: plan.leagueId,
        season: plan.season,
        teamId: { not: teamId },
        playerId: { in: plan.targetPlayerIds },
        isStarter: true
      },
      distinct: ["teamId"],
      select: { teamId: true }
    });
    const clearedCurrentTeam = await tx.teamPlayerSeason.updateMany({
      where: {
        leagueId: plan.leagueId,
        season: plan.season,
        teamId,
        isStarter: true,
        playerId: { notIn: plan.targetPlayerIds }
      },
      data: { isStarter: false }
    });
    const setCurrentTeam = await tx.teamPlayerSeason.updateMany({
      where: {
        leagueId: plan.leagueId,
        season: plan.season,
        teamId,
        active: true,
        isStarter: false,
        playerId: { in: plan.targetPlayerIds }
      },
      data: { isStarter: true }
    });
    const clearedOtherTeams = await tx.teamPlayerSeason.updateMany({
      where: {
        leagueId: plan.leagueId,
        season: plan.season,
        teamId: { not: teamId },
        playerId: { in: plan.targetPlayerIds },
        isStarter: true
      },
      data: { isStarter: false }
    });

    await tx.leagueSeasonTeam.update({
      where: {
        leagueId_season_teamId: {
          leagueId: plan.leagueId,
          season: plan.season,
          teamId
        }
      },
      data: {
        startingXiChangedAt: appliedAt,
        metadata: probableLineupMetadata(seasonTeam.metadata, plan, appliedAt)
      }
    });
    if (otherFlaggedTeams.length > 0) {
      await tx.leagueSeasonTeam.updateMany({
        where: {
          leagueId: plan.leagueId,
          season: plan.season,
          teamId: { in: otherFlaggedTeams.map((team) => team.teamId) }
        },
        data: { startingXiChangedAt: appliedAt }
      });
    }

    return {
      teamId,
      teamName,
      status: "APPLIED",
      startersSet: setCurrentTeam.count,
      startersCleared: clearedCurrentTeam.count,
      otherTeamFlagsCleared: clearedOtherTeams.count
    };
  });
}

function buildTeamPlan(input: {
  sourceLineup: ProbableTeamLineup;
  leagueId: bigint;
  leagueName: string;
  season: string;
  fetchedAt: Date;
  activeTeams: ActiveTeam[];
  providerCodeMaps: ProviderCodeMaps;
}): ProbableLineupTeamPlan {
  const teamResolution = resolveTeam(
    input.sourceLineup,
    input.activeTeams,
    input.providerCodeMaps.teams.get(providerCodeKey(input.sourceLineup.sourceTeamCode)) ?? null
  );
  if (!teamResolution.team) {
    return {
      source: input.sourceLineup.source,
      sourceUrl: input.sourceLineup.sourceUrl,
      leagueId: input.leagueId,
      leagueName: input.leagueName,
      season: input.season,
      fetchedAt: input.fetchedAt,
      sourceLineup: input.sourceLineup,
      teamId: null,
      databaseTeamName: null,
      teamMatchedBy: null,
      teamConfidence: teamResolution.confidence,
      status: "TEAM_UNMATCHED",
      playerResolutions: [],
      currentStarterIds: [],
      targetPlayerIds: [],
      startersToSet: 0,
      startersToClear: 0,
      problems: [`Source team '${input.sourceLineup.teamName}' did not resolve uniquely to an active database team.`]
    };
  }

  const roster = teamResolution.team.players.filter((row) => row.active).map((row) => ({
    playerId: row.playerId,
    name: row.player.name,
    position: row.position,
    shirtNumber: row.shirtNumber,
    isStarter: row.isStarter
  } satisfies ProbableLineupRosterPlayer));
  const playerResolutions = input.sourceLineup.players.map((sourcePlayer) => resolveProbableLineupPlayer(
    sourcePlayer,
    roster,
    input.providerCodeMaps.players.get(providerCodeKey(sourcePlayer.providerCode)) ?? null
  ));
  const resolvedIds = playerResolutions.flatMap((resolution) => resolution.playerId === null ? [] : [resolution.playerId]);
  const uniqueResolvedIds = [...new Set(resolvedIds.map(String))].map((playerId) => BigInt(playerId));
  const targetRoster = uniqueResolvedIds.map((playerId) => roster.find((candidate) => candidate.playerId === playerId));
  const goalkeeperCount = targetRoster.filter((candidate) => normalizeFantasyPosition(candidate?.position) === "GK").length;
  const firstResolvedPlayerId = playerResolutions[0]?.playerId ?? null;
  const firstResolvedPlayer = firstResolvedPlayerId === null ? null : roster.find((candidate) => candidate.playerId === firstResolvedPlayerId) ?? null;
  const problems: string[] = [];
  const unmatchedPlayerCount = playerResolutions.filter((resolution) => resolution.reason !== "MATCHED").length;
  if (unmatchedPlayerCount > 0) problems.push(`${unmatchedPlayerCount} source player(s) did not resolve uniquely to the active roster.`);
  if (resolvedIds.length !== uniqueResolvedIds.length) problems.push("Multiple source players resolved to the same roster player.");
  if (uniqueResolvedIds.length === EXPECTED_PLAYERS_PER_TEAM && goalkeeperCount !== 1) {
    problems.push(`Resolved lineup has ${goalkeeperCount} goalkeepers; exactly one is required.`);
  }
  if (uniqueResolvedIds.length === EXPECTED_PLAYERS_PER_TEAM && normalizeFantasyPosition(firstResolvedPlayer?.position) !== "GK") {
    problems.push("The first source player did not resolve to a goalkeeper.");
  }
  const fullyResolved = playerResolutions.length === EXPECTED_PLAYERS_PER_TEAM
    && playerResolutions.every((resolution) => resolution.reason === "MATCHED")
    && uniqueResolvedIds.length === EXPECTED_PLAYERS_PER_TEAM
    && goalkeeperCount === 1
    && normalizeFantasyPosition(firstResolvedPlayer?.position) === "GK";
  const currentStarterIds = teamResolution.team.players.filter((player) => player.isStarter).map((player) => player.playerId);
  const status: ProbableLineupTeamPlanStatus = !fullyResolved
    ? "PLAYERS_UNMATCHED"
    : sameBigIntSet(currentStarterIds, uniqueResolvedIds)
      ? "UNCHANGED"
      : "READY";
  const currentStarterKeys = new Set(currentStarterIds.map(String));
  const targetKeys = new Set(uniqueResolvedIds.map(String));

  return {
    source: input.sourceLineup.source,
    sourceUrl: input.sourceLineup.sourceUrl,
    leagueId: input.leagueId,
    leagueName: input.leagueName,
    season: input.season,
    fetchedAt: input.fetchedAt,
    sourceLineup: input.sourceLineup,
    teamId: teamResolution.team.teamId,
    databaseTeamName: teamResolution.team.team.name,
    teamMatchedBy: teamResolution.matchedBy,
    teamConfidence: teamResolution.confidence,
    status,
    playerResolutions,
    currentStarterIds,
    targetPlayerIds: fullyResolved ? uniqueResolvedIds : [],
    startersToSet: fullyResolved ? uniqueResolvedIds.filter((playerId) => !currentStarterKeys.has(String(playerId))).length : 0,
    startersToClear: fullyResolved ? currentStarterIds.filter((playerId) => !targetKeys.has(String(playerId))).length : 0,
    problems
  };
}

function resolveTeam(sourceLineup: ProbableTeamLineup, teams: ActiveTeam[], providerMappedTeamId: bigint | null) {
  if (providerMappedTeamId !== null) {
    const providerTeam = teams.find((team) => team.teamId === providerMappedTeamId);
    if (providerTeam) return { team: providerTeam, confidence: 1, matchedBy: "PROVIDER_CODE" as const };
  }

  const ranked = teams
    .map((team) => ({ team, confidence: probableLineupTeamScore(sourceLineup.teamName, team.team.name) }))
    .sort((left, right) => right.confidence - left.confidence || left.team.team.name.localeCompare(right.team.team.name));
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.confidence < TEAM_MATCH_THRESHOLD || (second && best.confidence - second.confidence < TEAM_AMBIGUITY_GAP)) {
    return { team: null, confidence: best?.confidence ?? 0, matchedBy: null };
  }
  return { team: best.team, confidence: best.confidence, matchedBy: "NAME" as const };
}

export function probableLineupTeamScore(sourceName: string, candidateName: string) {
  const source = normalizeLineupIdentity(sourceName);
  const candidate = normalizeLineupIdentity(candidateName);
  if (!source || !candidate) return 0;
  if (source === candidate) return 1;
  const sourceCore = teamCoreName(source);
  const candidateCore = teamCoreName(candidate);
  if (sourceCore && sourceCore === candidateCore) return 0.98;
  const sourceTokens = new Set(sourceCore.split(" ").filter(Boolean));
  const candidateTokens = new Set(candidateCore.split(" ").filter(Boolean));
  const intersection = [...sourceTokens].filter((token) => candidateTokens.has(token)).length;
  const union = new Set([...sourceTokens, ...candidateTokens]).size;
  const smallerSize = Math.min(sourceTokens.size, candidateTokens.size);
  if (smallerSize >= 2 && intersection === smallerSize) return 0.96;
  return union > 0 && intersection / union >= 0.8 ? roundedConfidence(0.9 + 0.08 * (intersection / union)) : 0;
}

function teamCoreName(value: string) {
  const ignored = new Set(["ac", "afc", "as", "calcio", "cf", "club", "fc", "football", "fsv", "rb", "sc", "ssc", "sv", "tsg", "vfb", "vfl"]);
  const aliases = new Map([
    ["cologne", "koln"],
    ["hamburger", "hamburg"],
    ["koeln", "koln"],
    ["mgladbach", "monchengladbach"],
    ["moenchengladbach", "monchengladbach"],
    ["munchen", "munich"]
  ]);
  return value
    .replace(/\bparis saint germain\b/g, "paris psg")
    .replace(/\bparis sg\b/g, "paris psg")
    .split(" ")
    .filter((token) => token && !ignored.has(token) && !/^\d{1,4}$/.test(token))
    .map((token) => aliases.get(token) ?? token)
    .join(" ");
}

function normalizedPlayerNameScore(sourceName: string, candidateName: string) {
  if (!sourceName || !candidateName) return 0;
  if (sourceName === candidateName) return 1;
  const sourceCompact = sourceName.replaceAll(" ", "");
  const candidateCompact = candidateName.replaceAll(" ", "");
  if (sourceCompact === candidateCompact) return 0.98;
  const sourceTokens = sourceName.split(" ").filter(Boolean);
  const candidateTokens = candidateName.split(" ").filter(Boolean);
  if (sameStringSet(sourceTokens, candidateTokens)) return 0.99;
  if (initialAndSurnameMatch(sourceTokens, candidateTokens)) return 0.96;
  if (firstNameAndSurnameInitialMatch(sourceTokens, candidateTokens)) return 0.94;

  const sourceSet = new Set(sourceTokens);
  const candidateSet = new Set(candidateTokens);
  const sourceInCandidate = sourceTokens.every((token) => candidateSet.has(token));
  const candidateInSource = candidateTokens.every((token) => sourceSet.has(token));
  if (candidateInSource && candidateTokens.length >= 2) return 0.96;
  if (sourceInCandidate && sourceTokens.length >= 2) return 0.94;
  const shorterCompactLength = Math.min(sourceCompact.length, candidateCompact.length);
  if (shorterCompactLength >= 5 && (sourceCompact.endsWith(candidateCompact) || candidateCompact.endsWith(sourceCompact))) {
    return 0.94;
  }
  if (shorterCompactLength >= 5 && (sourceCompact.startsWith(candidateCompact) || candidateCompact.startsWith(sourceCompact))) {
    return 0.84;
  }
  if (sourceTokens.length === 1 && candidateSet.has(sourceTokens[0])) {
    return candidateTokens.at(-1) === sourceTokens[0] ? 0.9 : 0.86;
  }

  const intersection = sourceTokens.filter((token) => candidateSet.has(token)).length;
  if (intersection >= 2) {
    const dice = (2 * intersection) / (sourceTokens.length + candidateTokens.length);
    return Math.min(0.92, 0.76 + 0.18 * dice);
  }
  return 0;
}

function initialAndSurnameMatch(left: string[], right: string[]) {
  const [short, full] = left[0]?.length === 1 ? [left, right] : right[0]?.length === 1 ? [right, left] : [null, null];
  if (!short || !full || short.length !== 2 || full.length < 2) return false;
  return full[0]?.startsWith(short[0] ?? "") === true && short[1] === full.at(-1);
}

function firstNameAndSurnameInitialMatch(left: string[], right: string[]) {
  const [abbreviated, single] = left.length === 2 && left[1]?.length === 1 && right.length === 1
    ? [left, right]
    : right.length === 2 && right[1]?.length === 1 && left.length === 1
      ? [right, left]
      : [null, null];
  return abbreviated !== null && single !== null && abbreviated[0] === single[0];
}

function matchedPlayer(
  sourcePlayer: ProbableLineupPlayer,
  candidate: ProbableLineupRosterPlayer,
  confidence: number,
  matchedBy: "PROVIDER_CODE" | "NAME",
  alternatives: ProbableLineupPlayerResolution["alternatives"]
): ProbableLineupPlayerResolution {
  return {
    sourcePlayer,
    playerId: candidate.playerId,
    playerName: candidate.name,
    confidence,
    matchedBy,
    alternatives,
    reason: "MATCHED"
  };
}

async function loadFplProviderCodeMaps(
  prisma: PrismaClient,
  season: string,
  page: ParsedProbableLineupPage
): Promise<ProviderCodeMaps> {
  const teamCodes = page.lineups.map((lineup) => providerCodeKey(lineup.sourceTeamCode)).filter(Boolean);
  const playerCodes = page.lineups.flatMap((lineup) => lineup.players.map((player) => providerCodeKey(player.providerCode))).filter(Boolean);
  const maps = await prisma.providerEntityMap.findMany({
    where: {
      provider: "FPL",
      providerSeason: season,
      status: "MATCHED",
      internalEntityId: { not: null },
      OR: [
        { providerEntityType: "TEAM", internalEntityType: "TEAM", providerEntityCode: { in: teamCodes } },
        { providerEntityType: "PLAYER", internalEntityType: "PLAYER", providerEntityCode: { in: playerCodes } }
      ]
    },
    select: {
      providerEntityType: true,
      providerEntityCode: true,
      internalEntityType: true,
      internalEntityId: true
    }
  });
  const result = emptyProviderCodeMaps();
  for (const map of maps) {
    const code = providerCodeKey(map.providerEntityCode);
    const internalId = positiveBigInt(map.internalEntityId);
    if (!code || internalId === null) continue;
    if (map.providerEntityType === "TEAM" && map.internalEntityType === "TEAM") result.teams.set(code, internalId);
    if (map.providerEntityType === "PLAYER" && map.internalEntityType === "PLAYER") result.players.set(code, internalId);
  }
  return result;
}

function probableLineupMetadata(existing: Prisma.JsonValue | null, plan: ProbableLineupTeamPlan, appliedAt: Date) {
  const metadata = jsonObject(existing);
  return {
    ...metadata,
    probableLineup: {
      source: plan.source,
      sourceUrl: plan.sourceUrl,
      sourceTeamCode: plan.sourceLineup.sourceTeamCode,
      sourceFixtureId: plan.sourceLineup.sourceFixtureId,
      sourceUpdatedText: plan.sourceLineup.sourceUpdatedText,
      fetchedAt: plan.fetchedAt.toISOString(),
      appliedAt: appliedAt.toISOString(),
      formation: plan.sourceLineup.formation,
      opponentName: plan.sourceLineup.opponentName,
      venue: plan.sourceLineup.venue,
      fingerprint: lineupFingerprint(plan.sourceLineup),
      players: plan.sourceLineup.players.map((player) => ({
        name: player.name,
        providerCode: player.providerCode,
        shirtNumber: player.shirtNumber
      }))
    }
  } satisfies Prisma.InputJsonObject;
}

function lineupFingerprint(lineup: ProbableTeamLineup) {
  return createHash("sha256").update(JSON.stringify({
    source: lineup.source,
    sourceTeamCode: lineup.sourceTeamCode,
    sourceFixtureId: lineup.sourceFixtureId,
    teamName: lineup.teamName,
    formation: lineup.formation,
    players: lineup.players.map((player) => ({
      name: normalizeLineupIdentity(player.name),
      providerCode: player.providerCode,
      shirtNumber: player.shirtNumber
    }))
  })).digest("hex");
}

async function responseTextWithLimit(response: Response, maximumBytes: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error(`Probable-lineup response declared ${declaredLength} bytes; limit is ${maximumBytes}.`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`Probable-lineup response exceeded ${maximumBytes} bytes.`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.InputJsonObject : {};
}

function emptyProviderCodeMaps(): ProviderCodeMaps {
  return { teams: new Map(), players: new Map() };
}

function providerCodeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleUpperCase("en").replace(/[^A-Z0-9]+/g, "");
}

function positiveBigInt(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > 0n ? parsed : null;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value ?? -1) >= 0 ? value as number : fallback;
}

function sameBigIntSet(left: readonly bigint[], right: readonly bigint[]) {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left.map(String));
  const rightSet = new Set(right.map(String));
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

function duplicateBigIntValues(values: readonly bigint[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) duplicates.add(key);
    else seen.add(key);
  }
  return duplicates;
}

function roundedConfidence(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(attempt: number) {
  return Math.min(4_000, 500 * 2 ** attempt);
}
