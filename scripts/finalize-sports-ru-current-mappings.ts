import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  excludeTransferredSportsRuPlayer,
  resolveSportsRuSeasonTeam,
  setSportsRuPlayerMapping
} from "@/machete/sports_ru_player_mapping";
import {
  sportsOnlyPlayerIdBase,
  sportsRuCurrentExpectedPriceCount,
  sportsRuCurrentLeagueIds,
  sportsRuCurrentSeason,
  sportsRuFinalExclusions,
  sportsRuFinalMappings,
  sportsRuSportsOnlySeeds
} from "./sports-ru-current-final-mapping-data";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const provider = "SPORTS_RU";
const providerEntityType = "FANTASY_PLAYER_PRICE";
const internalEntityType = "PLAYER";
const expectedMappedCount = sportsRuCurrentExpectedPriceCount - sportsRuFinalExclusions.length;
const allowedMissingFotMobTargetIds = new Set(["289490"]);

type FotMobPlayerProfile = {
  id?: number | string | null;
  name?: string | null;
  birthDate?: { utcTime?: string | null } | null;
};

async function main() {
  const scope = await loadScope();
  const liveProfileIds = [...new Set([
    ...sportsRuFinalMappings.flatMap((row) => row.profile ? [row.targetPlayerId] : []),
    ...sportsRuFinalExclusions.map((row) => row.verifiedFotMobPlayerId)
  ])];
  const liveProfiles = await fetchProfiles(liveProfileIds, 8);
  const validation = await validatePlan(scope, liveProfiles);
  console.log(JSON.stringify({
    apply,
    season: sportsRuCurrentSeason,
    leagues: sportsRuCurrentLeagueIds,
    before: databaseSummary(scope),
    planned: {
      mappings: sportsRuFinalMappings.length,
      exclusions: sportsRuFinalExclusions.length,
      sportsOnlySeeds: sportsRuSportsOnlySeeds.length,
      resultingMapped: validation.resultingMapped,
      resultingExcluded: validation.resultingExcluded,
      resultingUnresolved: validation.resultingUnresolved
    },
    validationErrors: validation.errors,
    changes: validation.changes
  }, bigintJson, 2));
  if (validation.errors.length > 0) {
    throw new Error(`Final Sports.ru mapping plan has ${validation.errors.length} validation error(s); refusing to write.`);
  }
  if (!apply) return;

  const backupPath = await writeBackup(scope);
  console.log(`Backup written: ${backupPath}`);

  const playerCatalogChanges = await ensureTargetPlayers();
  const mappingResults = [];
  for (const action of sportsRuFinalMappings) {
    const price = validation.priceByActionKey.get(actionKey(action.leagueId, action.providerPlayerId));
    if (!price) throw new Error(`Validated mapping price disappeared for ${action.leagueId}/${action.providerPlayerId}.`);
    mappingResults.push(await setSportsRuPlayerMapping(prisma, {
      priceId: price.id,
      contestId: price.contestId,
      playerId: BigInt(action.targetPlayerId),
      teamId: BigInt(action.targetTeamId),
      lockTeam: true
    }));
  }
  for (const exclusion of sportsRuFinalExclusions) {
    const price = validation.priceByActionKey.get(actionKey(exclusion.leagueId, exclusion.providerPlayerId));
    if (!price) throw new Error(`Validated exclusion price disappeared for ${exclusion.leagueId}/${exclusion.providerPlayerId}.`);
    await excludeTransferredSportsRuPlayer(prisma, { priceId: price.id, contestId: price.contestId });
  }

  await normalizeCurrentProviderMaps();
  const post = await loadScope();
  const postErrors = validateFinalDatabaseState(post);
  if (postErrors.length > 0) {
    throw new Error(`Post-apply validation failed: ${postErrors.join(" | ")}`);
  }

  console.log(JSON.stringify({
    applied: true,
    backupPath,
    playerCatalogChanges,
    mappingsApplied: mappingResults.length,
    exclusionsApplied: sportsRuFinalExclusions.length,
    selectionSync: mappingResults.reduce((total, result) => ({
      movedSelections: total.movedSelections + result.selectionSync.movedSelections,
      refreshedSelections: total.refreshedSelections + result.selectionSync.refreshedSelections,
      removedDuplicateSelections: total.removedDuplicateSelections + result.selectionSync.removedDuplicateSelections
    }), { movedSelections: 0, refreshedSelections: 0, removedDuplicateSelections: 0 }),
    after: databaseSummary(post),
    postValidationErrors: postErrors
  }, bigintJson, 2));
}

async function loadScope() {
  const leagueIds = sportsRuCurrentLeagueIds.map(BigInt);
  const contests = await prisma.fantasyContest.findMany({
    where: {
      provider,
      season: sportsRuCurrentSeason,
      prices: { some: { provider } }
    },
    include: { league: { select: { name: true } } },
    orderBy: { leagueId: "asc" }
  });
  const expectedContests = contests.filter((contest) => leagueIds.includes(contest.leagueId));
  const contestIds = expectedContests.map((contest) => contest.id);
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider,
      contestId: { in: contestIds },
      leagueId: { in: leagueIds },
      season: sportsRuCurrentSeason
    },
    include: { player: true, team: true },
    orderBy: [{ leagueId: "asc" }, { teamName: "asc" }, { playerName: "asc" }]
  });
  const priceIds = prices.map((price) => price.id);
  const [maps, seasonTeams] = await Promise.all([
    prisma.providerEntityMap.findMany({
      where: {
        provider,
        contestId: { in: contestIds },
        providerEntityType,
        providerEntityId: { in: priceIds },
        internalEntityType
      },
      orderBy: [{ providerEntityId: "asc" }, { providerSeason: "asc" }]
    }),
    prisma.leagueSeasonTeam.findMany({
      where: { leagueId: { in: leagueIds }, season: sportsRuCurrentSeason, active: true },
      include: { team: true }
    })
  ]);
  return { contests, expectedContests, prices, maps, seasonTeams };
}

async function validatePlan(scope: Awaited<ReturnType<typeof loadScope>>, liveProfiles: Map<string, FotMobPlayerProfile | Error>) {
  const errors = new Set<string>();
  const expectedLeagueIds = new Set<string>(sportsRuCurrentLeagueIds);
  const actualLeagueIds = scope.expectedContests.map((contest) => String(contest.leagueId));
  const unexpectedContests = scope.contests.filter((contest) => !expectedLeagueIds.has(String(contest.leagueId)));
  if (unexpectedContests.length > 0) {
    errors.add(`Unexpected current Sports.ru contests with prices: ${unexpectedContests.map((row) => `${row.leagueId}/${row.league.name}`).join(", ")}.`);
  }
  for (const leagueId of sportsRuCurrentLeagueIds) {
    const count = actualLeagueIds.filter((value) => value === leagueId).length;
    if (count !== 1) errors.add(`Expected exactly one Sports.ru contest for league ${leagueId}, found ${count}.`);
  }
  if (scope.prices.length !== sportsRuCurrentExpectedPriceCount) {
    errors.add(`Expected ${sportsRuCurrentExpectedPriceCount} current Sports.ru prices, found ${scope.prices.length}.`);
  }

  const priceByActionKey = new Map<string, (typeof scope.prices)[number]>();
  for (const price of scope.prices) {
    if (!price.providerPlayerId) {
      errors.add(`Price ${price.id} (${price.playerName}) has no providerPlayerId.`);
      continue;
    }
    const key = actionKey(String(price.leagueId), price.providerPlayerId);
    if (priceByActionKey.has(key)) errors.add(`Duplicate Sports.ru action key ${key}.`);
    priceByActionKey.set(key, price);
  }

  const declaredActionKeys = [
    ...sportsRuFinalMappings.map((row) => actionKey(row.leagueId, row.providerPlayerId)),
    ...sportsRuFinalExclusions.map((row) => actionKey(row.leagueId, row.providerPlayerId))
  ];
  if (new Set(declaredActionKeys).size !== declaredActionKeys.length) errors.add("The final action data contains duplicate league/provider player keys.");

  const seedByPlayerId = new Map(sportsRuSportsOnlySeeds.map((seed) => [seed.playerId, seed]));
  const sportsOnlyMappingIds = sportsRuFinalMappings.filter((row) => !row.profile).map((row) => row.targetPlayerId);
  if (sportsOnlyMappingIds.length !== sportsRuSportsOnlySeeds.length || sportsOnlyMappingIds.some((id) => !seedByPlayerId.has(id))) {
    errors.add("Sports.ru-only mapping rows and explicit synthetic player seeds are not a one-to-one set.");
  }

  const targetPlayerIds = sportsRuFinalMappings.map((row) => BigInt(row.targetPlayerId));
  const corePlayers = await prisma.corePlayer.findMany({ where: { id: { in: targetPlayerIds } } });
  const corePlayerById = new Map(corePlayers.map((player) => [String(player.id), player]));
  const teamsByScope = new Map<string, typeof scope.seasonTeams>();
  for (const team of scope.seasonTeams) {
    const key = `${team.leagueId}/${team.season}`;
    teamsByScope.set(key, [...(teamsByScope.get(key) ?? []), team]);
  }
  const unresolvedTeamNames = new Set<string>();
  for (const price of scope.prices) {
    const candidates = teamsByScope.get(`${price.leagueId}/${price.season}`) ?? [];
    if (!resolveSportsRuSeasonTeam(price.teamName, candidates)) unresolvedTeamNames.add(`${price.leagueId}/${price.teamName}`);
  }
  if (unresolvedTeamNames.size > 0) errors.add(`Sports.ru team aliases remain unresolved: ${[...unresolvedTeamNames].join(", ")}.`);

  const changes = [];
  for (const action of sportsRuFinalMappings) {
    const key = actionKey(action.leagueId, action.providerPlayerId);
    const price = priceByActionKey.get(key);
    if (!price) {
      errors.add(`Mapping target price ${key} does not exist.`);
      continue;
    }
    const targetTeam = resolveSportsRuSeasonTeam(price.teamName, teamsByScope.get(`${price.leagueId}/${price.season}`) ?? []);
    if (!targetTeam || String(targetTeam.teamId) !== action.targetTeamId || targetTeam.team.name !== action.targetTeamName) {
      errors.add(`${key} target team is ${targetTeam ? `${targetTeam.teamId}/${targetTeam.team.name}` : "unresolved"}, expected ${action.targetTeamId}/${action.targetTeamName}.`);
    }
    const expectedBirthDate = action.profile?.birthDate ?? seedByPlayerId.get(action.targetPlayerId)?.birthDate ?? null;
    if (dateOnly(price.providerBirthDate) !== expectedBirthDate) {
      errors.add(`${key} Sports.ru birth date ${dateOnly(price.providerBirthDate)} does not match reviewed identity ${expectedBirthDate}.`);
    }
    if (action.profile) {
      validateLiveProfile(errors, liveProfiles, action.targetPlayerId, action.profile.name, action.profile.birthDate, key);
      const corePlayer = corePlayerById.get(action.targetPlayerId);
      if (!corePlayer && !allowedMissingFotMobTargetIds.has(action.targetPlayerId)) {
        errors.add(`${key} reviewed FotMob core player ${action.targetPlayerId} is missing.`);
      } else if (corePlayer?.birthDate && dateOnly(corePlayer.birthDate) !== action.profile.birthDate) {
        errors.add(`${key} core player ${action.targetPlayerId} birth date ${dateOnly(corePlayer.birthDate)} differs from live FotMob ${action.profile.birthDate}.`);
      }
    } else {
      const seed = seedByPlayerId.get(action.targetPlayerId);
      if (!seed || seed.providerPlayerId !== action.providerPlayerId) errors.add(`${key} has no exact Sports.ru-only seed.`);
      const existing = corePlayerById.get(action.targetPlayerId);
      if (existing && (
        existing.source !== "sports_ru"
        || existing.rawRef !== action.providerPlayerId
        || existing.name !== seed?.name
        || dateOnly(existing.birthDate) !== seed?.birthDate
      )) errors.add(`${key} synthetic core player ${action.targetPlayerId} exists with conflicting provenance or identity.`);
    }
    changes.push({
      kind: "MAP",
      leagueId: action.leagueId,
      providerPlayerId: action.providerPlayerId,
      sportsName: price.playerName,
      sportsTeam: price.teamName,
      beforePlayerId: price.playerId ? String(price.playerId) : null,
      beforeTeamId: price.teamId ? String(price.teamId) : null,
      afterPlayerId: action.targetPlayerId,
      afterTeamId: action.targetTeamId,
      afterTeam: action.targetTeamName,
      reason: action.reason
    });
  }

  for (const exclusion of sportsRuFinalExclusions) {
    const key = actionKey(exclusion.leagueId, exclusion.providerPlayerId);
    const price = priceByActionKey.get(key);
    if (!price) {
      errors.add(`Exclusion target price ${key} does not exist.`);
      continue;
    }
    if (dateOnly(price.providerBirthDate) !== exclusion.profile.birthDate) {
      errors.add(`${key} Sports.ru birth date ${dateOnly(price.providerBirthDate)} does not match exclusion identity ${exclusion.profile.birthDate}.`);
    }
    validateLiveProfile(
      errors,
      liveProfiles,
      exclusion.verifiedFotMobPlayerId,
      exclusion.profile.name,
      exclusion.profile.birthDate,
      key
    );
    changes.push({
      kind: "EXCLUDE",
      leagueId: exclusion.leagueId,
      providerPlayerId: exclusion.providerPlayerId,
      sportsName: price.playerName,
      sportsTeam: price.teamName,
      beforePlayerId: price.playerId ? String(price.playerId) : null,
      beforeTeamId: price.teamId ? String(price.teamId) : null,
      afterPlayerId: null,
      afterTeamId: null,
      verifiedFotMobPlayerId: exclusion.verifiedFotMobPlayerId,
      reason: exclusion.reason
    });
  }

  const mappingByKey = new Map(sportsRuFinalMappings.map((row) => [actionKey(row.leagueId, row.providerPlayerId), row]));
  const exclusionKeys = new Set(sportsRuFinalExclusions.map((row) => actionKey(row.leagueId, row.providerPlayerId)));
  const claims = new Map<string, Array<(typeof scope.prices)[number]>>();
  let resultingMapped = 0;
  let resultingExcluded = 0;
  let resultingUnresolved = 0;
  for (const price of scope.prices) {
    const key = price.providerPlayerId ? actionKey(String(price.leagueId), price.providerPlayerId) : "";
    const mapping = mappingByKey.get(key);
    const excluded = exclusionKeys.has(key);
    const desiredPlayerId = mapping?.targetPlayerId ?? (excluded ? null : price.playerId ? String(price.playerId) : null);
    if (desiredPlayerId) {
      resultingMapped += 1;
      const claimKey = `${price.contestId}/${desiredPlayerId}`;
      claims.set(claimKey, [...(claims.get(claimKey) ?? []), price]);
    } else if (excluded) {
      resultingExcluded += 1;
    } else {
      resultingUnresolved += 1;
      errors.add(`${key || price.id} would remain unresolved after the final plan.`);
    }
  }
  for (const [claimKey, rows] of claims) {
    if (rows.length > 1) errors.add(`Duplicate final player claim ${claimKey}: ${rows.map((row) => `${row.providerPlayerId}/${row.playerName}`).join(", ")}.`);
  }
  if (resultingMapped !== expectedMappedCount || resultingExcluded !== sportsRuFinalExclusions.length || resultingUnresolved !== 0) {
    errors.add(`Final counts would be mapped=${resultingMapped}, excluded=${resultingExcluded}, unresolved=${resultingUnresolved}; expected ${expectedMappedCount}/${sportsRuFinalExclusions.length}/0.`);
  }

  return { errors: [...errors], changes, priceByActionKey, resultingMapped, resultingExcluded, resultingUnresolved };
}

function validateLiveProfile(
  errors: Set<string>,
  profiles: Map<string, FotMobPlayerProfile | Error>,
  playerId: string,
  expectedName: string,
  expectedBirthDate: string,
  context: string
) {
  const profile = profiles.get(playerId);
  if (!profile || profile instanceof Error) {
    errors.add(`${context} FotMob ${playerId} is unavailable: ${profile instanceof Error ? profile.message : "not fetched"}.`);
    return;
  }
  const actualName = profile.name?.trim() ?? "";
  const actualBirthDate = dateOnly(profile.birthDate?.utcTime ?? null);
  if (actualName !== expectedName || actualBirthDate !== expectedBirthDate) {
    errors.add(`${context} FotMob ${playerId} live identity is ${actualName}/${actualBirthDate}, expected ${expectedName}/${expectedBirthDate}.`);
  }
}

async function ensureTargetPlayers() {
  const created: string[] = [];
  const birthDatesFilled: string[] = [];
  for (const action of sportsRuFinalMappings.filter((row) => row.profile)) {
    const id = BigInt(action.targetPlayerId);
    const existing = await prisma.corePlayer.findUnique({ where: { id } });
    if (existing) {
      if (!existing.birthDate) {
        await prisma.corePlayer.update({
          where: { id },
          data: { birthDate: new Date(`${action.profile!.birthDate}T00:00:00.000Z`) }
        });
        birthDatesFilled.push(action.targetPlayerId);
      }
      continue;
    }
    if (!allowedMissingFotMobTargetIds.has(action.targetPlayerId)) {
      throw new Error(`Unexpected missing FotMob core player ${action.targetPlayerId}.`);
    }
    await prisma.corePlayer.create({
      data: {
        id,
        name: action.profile!.name,
        country: action.targetPlayerId === "289490" ? "Russia" : null,
        birthDate: new Date(`${action.profile!.birthDate}T00:00:00.000Z`),
        source: "fotmob",
        rawRef: action.targetPlayerId
      }
    });
    created.push(action.targetPlayerId);
  }
  for (const seed of sportsRuSportsOnlySeeds) {
    const id = BigInt(seed.playerId);
    const existing = await prisma.corePlayer.findUnique({ where: { id } });
    if (!existing) {
      await prisma.corePlayer.create({
        data: {
          id,
          name: seed.name,
          country: seed.country,
          birthDate: new Date(`${seed.birthDate}T00:00:00.000Z`),
          source: "sports_ru",
          rawRef: seed.providerPlayerId
        }
      });
      created.push(seed.playerId);
      continue;
    }
    if (
      existing.source !== "sports_ru"
      || existing.rawRef !== seed.providerPlayerId
      || existing.name !== seed.name
      || existing.country !== seed.country
      || dateOnly(existing.birthDate) !== seed.birthDate
    ) throw new Error(`Synthetic player id collision for Sports.ru ${seed.providerPlayerId}.`);
  }
  return { created, birthDatesFilled };
}

async function normalizeCurrentProviderMaps() {
  const scope = await loadScope();
  const mapsByPriceId = new Map<string, typeof scope.maps>();
  for (const map of scope.maps) mapsByPriceId.set(map.providerEntityId, [...(mapsByPriceId.get(map.providerEntityId) ?? []), map]);
  for (const priceChunk of chunks(scope.prices, 100)) {
    await prisma.$transaction(priceChunk.map((price) => {
      const maps = mapsByPriceId.get(price.id) ?? [];
      const status = price.playerId ? "MATCHED" : "EXCLUDED";
      const internalEntityId = price.playerId ? String(price.playerId) : null;
      const consistent = maps.find((map) =>
        map.providerSeason === sportsRuCurrentSeason
        && map.status === status
        && map.internalEntityId === internalEntityId
      ) ?? maps.find((map) => map.status === status && map.internalEntityId === internalEntityId);
      return prisma.providerEntityMap.upsert({
        where: {
          provider_providerSeason_providerEntityType_providerEntityId_internalEntityType: {
            provider,
            providerSeason: sportsRuCurrentSeason,
            providerEntityType,
            providerEntityId: price.id,
            internalEntityType
          }
        },
        update: {
          contestId: price.contestId,
          internalEntityId,
          confidence: consistent?.confidence ?? 1,
          matchedBy: consistent?.matchedBy ?? (price.playerId ? "MIGRATED_FROM_PRICE" : "MANUAL_TRANSFERRED_OUT"),
          status
        },
        create: {
          provider,
          contestId: price.contestId,
          providerSeason: sportsRuCurrentSeason,
          providerEntityType,
          providerEntityId: price.id,
          internalEntityType,
          internalEntityId,
          confidence: consistent?.confidence ?? 1,
          matchedBy: consistent?.matchedBy ?? (price.playerId ? "MIGRATED_FROM_PRICE" : "MANUAL_TRANSFERRED_OUT"),
          status
        }
      });
    }));
  }
  for (const priceIdChunk of chunks(scope.prices.map((price) => price.id), 500)) {
    await prisma.providerEntityMap.deleteMany({
      where: {
        provider,
        providerEntityType,
        providerEntityId: { in: priceIdChunk },
        internalEntityType,
        providerSeason: { not: sportsRuCurrentSeason }
      }
    });
  }
}

function validateFinalDatabaseState(scope: Awaited<ReturnType<typeof loadScope>>) {
  const errors: string[] = [];
  const exclusionKeys = new Set(sportsRuFinalExclusions.map((row) => actionKey(row.leagueId, row.providerPlayerId)));
  const mappingByKey = new Map(sportsRuFinalMappings.map((row) => [actionKey(row.leagueId, row.providerPlayerId), row]));
  const mapsByPriceId = new Map<string, typeof scope.maps>();
  for (const map of scope.maps) mapsByPriceId.set(map.providerEntityId, [...(mapsByPriceId.get(map.providerEntityId) ?? []), map]);
  const claims = new Map<string, string[]>();
  for (const price of scope.prices) {
    const key = price.providerPlayerId ? actionKey(String(price.leagueId), price.providerPlayerId) : price.id;
    const expectedMapping = mappingByKey.get(key);
    const excluded = exclusionKeys.has(key);
    if (expectedMapping && (String(price.playerId ?? "") !== expectedMapping.targetPlayerId || String(price.teamId ?? "") !== expectedMapping.targetTeamId)) {
      errors.push(`${key} final price is ${price.playerId ?? "null"}/${price.teamId ?? "null"}, expected ${expectedMapping.targetPlayerId}/${expectedMapping.targetTeamId}.`);
    }
    if (excluded && (price.playerId !== null || price.teamId !== null)) errors.push(`${key} final exclusion still has a player or team.`);
    if (!price.playerId && !excluded) errors.push(`${key} is unresolved.`);
    if (price.playerId) {
      const claimKey = `${price.contestId}/${price.playerId}`;
      claims.set(claimKey, [...(claims.get(claimKey) ?? []), key]);
    }
    const maps = mapsByPriceId.get(price.id) ?? [];
    const expectedStatus = price.playerId ? "MATCHED" : "EXCLUDED";
    const expectedInternalId = price.playerId ? String(price.playerId) : null;
    if (
      maps.length !== 1
      || maps[0]?.providerSeason !== sportsRuCurrentSeason
      || maps[0]?.status !== expectedStatus
      || maps[0]?.internalEntityId !== expectedInternalId
    ) errors.push(`${key} does not have exactly one consistent current provider map.`);
  }
  for (const [claim, rows] of claims) if (rows.length > 1) errors.push(`Duplicate post-apply claim ${claim}: ${rows.join(", ")}.`);
  const summary = databaseSummary(scope);
  if (summary.mapped !== expectedMappedCount || summary.excluded !== sportsRuFinalExclusions.length || summary.unresolved !== 0) {
    errors.push(`Post counts are ${summary.mapped}/${summary.excluded}/${summary.unresolved}, expected ${expectedMappedCount}/${sportsRuFinalExclusions.length}/0.`);
  }
  return errors;
}

async function writeBackup(scope: Awaited<ReturnType<typeof loadScope>>) {
  const contestIds = scope.expectedContests.map((contest) => contest.id);
  const playerIds = [...new Set([
    ...scope.prices.flatMap((price) => price.playerId ? [price.playerId] : []),
    ...sportsRuFinalMappings.map((row) => BigInt(row.targetPlayerId))
  ])];
  const leagueIds = sportsRuCurrentLeagueIds.map(BigInt);
  const [players, rosters, squads] = await Promise.all([
    prisma.corePlayer.findMany({ where: { id: { in: playerIds } } }),
    prisma.teamPlayerSeason.findMany({
      where: { leagueId: { in: leagueIds }, season: sportsRuCurrentSeason },
      orderBy: [{ leagueId: "asc" }, { teamId: "asc" }, { playerId: "asc" }]
    }),
    prisma.userFantasySquad.findMany({
      where: { provider, contestId: { in: contestIds }, season: sportsRuCurrentSeason },
      include: { players: true }
    })
  ]);
  const directory = process.env.MAPPING_BACKUP_DIR || path.join(process.cwd(), "output", "mapping-backups");
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(directory, `sports-ru-all-current-before-final-${stamp}.json`);
  await writeFile(destination, JSON.stringify({
    createdAt: new Date().toISOString(),
    season: sportsRuCurrentSeason,
    leagues: sportsRuCurrentLeagueIds,
    actions: sportsRuFinalMappings,
    exclusions: sportsRuFinalExclusions,
    contests: scope.expectedContests,
    prices: scope.prices,
    providerMaps: scope.maps,
    seasonTeams: scope.seasonTeams,
    rosterEntries: rosters,
    corePlayers: players,
    squads
  }, bigintJson, 2), { flag: "wx" });
  return destination;
}

function databaseSummary(scope: Awaited<ReturnType<typeof loadScope>>) {
  const currentMapByPriceId = new Map(scope.maps
    .filter((map) => map.providerSeason === sportsRuCurrentSeason)
    .map((map) => [map.providerEntityId, map]));
  const excluded = scope.prices.filter((price) => {
    const map = currentMapByPriceId.get(price.id);
    return !price.playerId && !price.teamId && map?.status === "EXCLUDED" && map.internalEntityId === null;
  }).length;
  const mapped = scope.prices.filter((price) => price.playerId).length;
  const duplicateClaims = new Map<string, number>();
  for (const price of scope.prices) {
    if (!price.playerId) continue;
    const key = `${price.contestId}/${price.playerId}`;
    duplicateClaims.set(key, (duplicateClaims.get(key) ?? 0) + 1);
  }
  return {
    contests: scope.expectedContests.length,
    prices: scope.prices.length,
    mapped,
    excluded,
    unresolved: scope.prices.length - mapped - excluded,
    sportsOnly: scope.prices.filter((price) => price.playerId && price.playerId >= sportsOnlyPlayerIdBase).length,
    providerMaps: scope.maps.length,
    currentProviderMaps: scope.maps.filter((map) => map.providerSeason === sportsRuCurrentSeason).length,
    legacyProviderMaps: scope.maps.filter((map) => map.providerSeason !== sportsRuCurrentSeason).length,
    duplicatePlayerClaims: [...duplicateClaims.values()].filter((count) => count > 1).length
  };
}

async function fetchProfiles(playerIds: string[], concurrency: number) {
  const result = new Map<string, FotMobPlayerProfile | Error>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, playerIds.length) }, async () => {
    while (cursor < playerIds.length) {
      const playerId = playerIds[cursor];
      cursor += 1;
      try {
        result.set(playerId, await fetchFotMobProfile(playerId));
      } catch (error) {
        result.set(playerId, error instanceof Error ? error : new Error(String(error)));
      }
    }
  });
  await Promise.all(workers);
  return result;
}

async function fetchFotMobProfile(playerId: string) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`https://www.fotmob.com/api/data/playerData?id=${encodeURIComponent(playerId)}`, {
        headers: { "user-agent": "FantasyScoutSportsRuFinalMapping/1.0" },
        signal: AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw new Error(`FotMob ${response.status} ${response.statusText}`);
      const profile = await response.json() as FotMobPlayerProfile;
      if (String(profile.id ?? "") !== playerId) throw new Error(`FotMob returned player ${profile.id ?? "null"}`);
      return profile;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError ?? new Error("FotMob profile request failed");
}

function actionKey(leagueId: string, providerPlayerId: string) {
  return `${leagueId}/${providerPlayerId}`;
}

function dateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function bigintJson(_key: string, value: unknown) {
  return typeof value === "bigint" ? String(value) : value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
