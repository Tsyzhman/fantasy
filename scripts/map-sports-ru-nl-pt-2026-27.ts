import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  excludeTransferredSportsRuPlayer,
  setSportsRuPlayerMapping
} from "@/machete/sports_ru_player_mapping";

import {
  sportsRuNetherlandsPortugal2026ExcludedPlayers,
  sportsRuNetherlandsPortugal2026Mappings,
  sportsRuNetherlandsPortugal2026SeedPlayers,
  sportsRuNetherlandsPortugal2026SportsOnlySeedPlayers
} from "./sports-ru-nl-pt-2026-27-data";

const prisma = new PrismaClient();
const provider = "SPORTS_RU";
const season = "2026/2027";
const apply = process.argv.includes("--apply");
const correctionProviderIds = ["68907", "68765", "68764"] as const;

const countryNameByCode: Readonly<Record<string, string>> = {
  ANG: "Angola",
  BEL: "Belgium",
  BRA: "Brazil",
  CIV: "Ivory Coast",
  CMR: "Cameroon",
  ECU: "Ecuador",
  ESP: "Spain",
  GER: "Germany",
  GHA: "Ghana",
  MAR: "Morocco",
  NED: "Netherlands",
  POR: "Portugal",
  SEN: "Senegal",
  TUR: "Turkey"
};

async function main() {
  validateStaticData();
  const plan = await buildPlan();
  console.log(JSON.stringify({
    apply,
    mappings: plan.rows.length,
    changes: plan.rows.filter((row) => !row.alreadyMapped).length,
    exclusions: plan.exclusionRows.length,
    exclusionChanges: plan.exclusionRows.filter((row) => !row.alreadyExcluded).length,
    plannedPlayerSeeds: plan.playerSeeds.length,
    errors: plan.errors,
    corrections: plan.rows.slice(0, correctionProviderIds.length),
    changesByLeague: countByLeague(plan.rows.filter((row) => !row.alreadyMapped))
  }, bigintJson, 2));

  if (plan.errors.length > 0) {
    throw new Error(`Netherlands/Portugal Sports.ru mapping plan failed with ${plan.errors.length} error(s).`);
  }
  if (!apply) return;

  const backupPath = await writeBackup(plan);
  console.log(`Backup written: ${backupPath}`);

  for (const seed of plan.playerSeeds) {
    await prisma.corePlayer.create({
      data: {
        id: BigInt(seed.playerId),
        name: seed.playerName,
        birthDate: seed.birthDate ? new Date(`${seed.birthDate}T00:00:00.000Z`) : null,
        country: countryNameByCode[seed.countryCode] ?? seed.countryCode,
        source: seed.source,
        rawRef: seed.rawRef
      }
    });
  }

  const exclusionResults = [];
  for (const row of plan.exclusionRows) {
    exclusionResults.push(await excludeTransferredSportsRuPlayer(prisma, {
      priceId: row.priceId
    }));
  }

  const results = [];
  for (const row of plan.rows) {
    results.push(await setSportsRuPlayerMapping(prisma, {
      priceId: row.priceId,
      playerId: BigInt(row.playerId),
      teamId: BigInt(row.targetTeamId),
      lockTeam: row.mappingMode === "TEAM_OVERRIDE"
    }));
  }

  console.log(JSON.stringify({
    applied: results.length,
    excluded: exclusionResults.length,
    seededPlayers: plan.playerSeeds.length,
    movedSelections: results.reduce((sum, row) => sum + row.selectionSync.movedSelections, 0),
    removedDuplicateSelections: results.reduce((sum, row) => sum + row.selectionSync.removedDuplicateSelections, 0)
  }, bigintJson, 2));
}

async function buildPlan() {
  const leagueIds = [...new Set([
    ...sportsRuNetherlandsPortugal2026Mappings.map(([leagueId]) => BigInt(leagueId)),
    ...sportsRuNetherlandsPortugal2026ExcludedPlayers.map(([leagueId]) => BigInt(leagueId))
  ])];
  const providerPlayerIds = [
    ...sportsRuNetherlandsPortugal2026Mappings.map(([, providerPlayerId]) => providerPlayerId),
    ...sportsRuNetherlandsPortugal2026ExcludedPlayers.map(([, providerPlayerId]) => providerPlayerId)
  ];
  const targetPlayerIds = sportsRuNetherlandsPortugal2026Mappings.map(([, , playerId]) => BigInt(playerId));
  const [prices, players, seasonTeams] = await Promise.all([
    prisma.fantasyPlayerPrice.findMany({
      where: {
        provider,
        season,
        leagueId: { in: leagueIds },
        providerPlayerId: { in: providerPlayerIds }
      }
    }),
    prisma.corePlayer.findMany({ where: { id: { in: targetPlayerIds } } }),
    prisma.leagueSeasonTeam.findMany({
      where: { leagueId: { in: leagueIds }, season, active: true },
      include: { team: true }
    })
  ]);

  const priceByKey = new Map(prices.map((price) => [mappingKey(price.leagueId, price.providerPlayerId), price]));
  const playerById = new Map(players.map((player) => [String(player.id), player]));
  const seedProfiles = [
    ...sportsRuNetherlandsPortugal2026SeedPlayers.map((seed) => ({
      playerId: seed[0],
      playerName: seed[1],
      birthDate: seed[2] as string | null,
      countryCode: seed[3],
      source: "fotmob",
      rawRef: seed[0]
    })),
    ...sportsRuNetherlandsPortugal2026SportsOnlySeedPlayers.map((seed) => ({
      playerId: seed[0],
      playerName: seed[1],
      birthDate: seed[2],
      countryCode: seed[3],
      source: "sports_ru",
      rawRef: seed[4]
    }))
  ] as const;
  const seedById = new Map(seedProfiles.map((seed) => [seed.playerId, seed]));
  const teamByKey = new Map(seasonTeams.map((entry) => [teamKey(entry.leagueId, entry.team.name), entry]));
  const errors: string[] = [];

  const playerSeeds = [...new Set(targetPlayerIds.map(String))].flatMap((playerId) => {
    if (playerById.has(playerId)) return [];
    const seed = seedById.get(playerId);
    if (!seed) {
      errors.push(`Core player ${playerId} is missing and has no verified seed profile.`);
      return [];
    }
    return [{
      ...seed
    }];
  });

  const rows = sportsRuNetherlandsPortugal2026Mappings.flatMap(([
    leagueId,
    providerPlayerId,
    playerId,
    targetTeamName,
    mappingMode
  ]) => {
    const price = priceByKey.get(mappingKey(BigInt(leagueId), providerPlayerId));
    const team = teamByKey.get(teamKey(BigInt(leagueId), targetTeamName));
    if (!price) errors.push(`Sports.ru price ${leagueId}/${providerPlayerId} was not found.`);
    if (!team) errors.push(`Active target team ${leagueId}/${targetTeamName} was not found.`);
    if (!playerById.has(playerId) && !seedById.has(playerId)) {
      errors.push(`Core player ${playerId} was neither found nor seedable.`);
    }
    if (!price || !team) return [];
    return [{
      leagueId,
      providerPlayerId,
      sportsName: price.playerName,
      sportsTeamName: price.teamName,
      priceId: price.id,
      playerId,
      currentPlayerId: price.playerId ? String(price.playerId) : null,
      currentTeamId: price.teamId ? String(price.teamId) : null,
      targetTeamId: String(team.teamId),
      targetTeamName: team.team.name,
      mappingMode: mappingMode ?? null,
      alreadyMapped: price.playerId === BigInt(playerId) && price.teamId === team.teamId
    }];
  });

  const providerMaps = await prisma.providerEntityMap.findMany({
    where: {
      provider,
      providerEntityType: "FANTASY_PLAYER_PRICE",
      providerEntityId: { in: prices.map((price) => price.id) },
      internalEntityType: "PLAYER"
    }
  });
  const providerMapByPriceId = new Map(providerMaps.map((row) => [row.providerEntityId, row]));
  const exclusionRows = sportsRuNetherlandsPortugal2026ExcludedPlayers.flatMap(([
    leagueId,
    providerPlayerId,
    verifiedFotMobPlayerId,
    reason
  ]) => {
    const price = priceByKey.get(mappingKey(BigInt(leagueId), providerPlayerId));
    if (!price) {
      errors.push(`Sports.ru exclusion ${leagueId}/${providerPlayerId} was not found.`);
      return [];
    }
    const providerMap = providerMapByPriceId.get(price.id);
    return [{
      leagueId,
      providerPlayerId,
      verifiedFotMobPlayerId,
      reason,
      sportsName: price.playerName,
      sportsTeamName: price.teamName,
      priceId: price.id,
      currentPlayerId: price.playerId ? String(price.playerId) : null,
      currentTeamId: price.teamId ? String(price.teamId) : null,
      alreadyExcluded: providerMap?.status === "EXCLUDED" && providerMap.matchedBy === "MANUAL_TRANSFERRED_OUT"
    }];
  });

  if (rows.length !== sportsRuNetherlandsPortugal2026Mappings.length) {
    errors.push(`Resolved ${rows.length} of ${sportsRuNetherlandsPortugal2026Mappings.length} mapping rows.`);
  }
  if (exclusionRows.length !== sportsRuNetherlandsPortugal2026ExcludedPlayers.length) {
    errors.push(`Resolved ${exclusionRows.length} of ${sportsRuNetherlandsPortugal2026ExcludedPlayers.length} exclusion rows.`);
  }
  return { rows, exclusionRows, prices, playerSeeds, errors };
}

async function writeBackup(plan: Awaited<ReturnType<typeof buildPlan>>) {
  const affectedPriceIds = plan.prices.map((price) => price.id);
  const leagueIds = [...new Set(sportsRuNetherlandsPortugal2026Mappings.map(([leagueId]) => BigInt(leagueId)))];
  const [providerMaps, squads] = await Promise.all([
    prisma.providerEntityMap.findMany({
      where: {
        provider,
        providerEntityType: "FANTASY_PLAYER_PRICE",
        providerEntityId: { in: affectedPriceIds },
        internalEntityType: "PLAYER"
      }
    }),
    prisma.userFantasySquad.findMany({
      where: { leagueId: { in: leagueIds }, season },
      include: { players: true }
    })
  ]);
  const backupDir = process.env.MAPPING_BACKUP_DIR || path.join(process.cwd(), "output", "mapping-backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `sports-ru-nl-pt-2026-27-${stamp}.json`);
  await writeFile(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    season,
    mappings: sportsRuNetherlandsPortugal2026Mappings,
    exclusions: sportsRuNetherlandsPortugal2026ExcludedPlayers,
    plannedPlayerSeeds: plan.playerSeeds,
    prices: plan.prices,
    providerMaps,
    squads
  }, bigintJson, 2), { flag: "wx" });
  return backupPath;
}

function validateStaticData() {
  assertUnique("league/provider", [
    ...sportsRuNetherlandsPortugal2026Mappings.map(([leagueId, providerId]) => `${leagueId}/${providerId}`),
    ...sportsRuNetherlandsPortugal2026ExcludedPlayers.map(([leagueId, providerId]) => `${leagueId}/${providerId}`)
  ]);
  assertUnique("target player", sportsRuNetherlandsPortugal2026Mappings.map(([, , playerId]) => playerId));
  assertUnique("seed player", [
    ...sportsRuNetherlandsPortugal2026SeedPlayers.map(([playerId]) => playerId),
    ...sportsRuNetherlandsPortugal2026SportsOnlySeedPlayers.map(([playerId]) => playerId)
  ]);
  const actualCorrections = sportsRuNetherlandsPortugal2026Mappings
    .slice(0, correctionProviderIds.length)
    .map(([, providerPlayerId]) => providerPlayerId);
  if (actualCorrections.join(",") !== correctionProviderIds.join(",")) {
    throw new Error(`Known corrections must run first in order: ${correctionProviderIds.join(", ")}.`);
  }
  const youngSorrisoIndex = sportsRuNetherlandsPortugal2026Mappings.findIndex(([, providerId]) => providerId === "68764");
  const olderSorrisoIndex = sportsRuNetherlandsPortugal2026Mappings.findIndex(([, providerId]) => providerId === "68831");
  if (youngSorrisoIndex < 0 || olderSorrisoIndex < 0 || youngSorrisoIndex >= olderSorrisoIndex) {
    throw new Error("The young Sorriso correction must run before the older Sorriso mapping.");
  }
}

function assertUnique(label: string, values: readonly string[]) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) throw new Error(`Duplicate ${label}: ${[...new Set(duplicates)].join(", ")}`);
}

function mappingKey(leagueId: bigint, providerPlayerId: string | null) {
  return `${leagueId}/${providerPlayerId ?? ""}`;
}

function teamKey(leagueId: bigint, teamName: string) {
  return `${leagueId}/${teamName}`;
}

function countByLeague(rows: ReadonlyArray<{ leagueId: string }>) {
  return Object.fromEntries(["57", "61"].map((leagueId) => [leagueId, rows.filter((row) => row.leagueId === leagueId).length]));
}

function bigintJson(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
