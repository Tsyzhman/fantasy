import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { setSportsRuPlayerMapping } from "@/machete/sports_ru_player_mapping";

import {
  sportsRuNetherlandsPortugal2026Mappings,
  sportsRuNetherlandsPortugal2026SeedPlayers
} from "./sports-ru-nl-pt-2026-27-data";

const prisma = new PrismaClient();
const provider = "SPORTS_RU";
const season = "2026/2027";
const apply = process.argv.includes("--apply");
const correctionProviderIds = ["68907", "68765", "68764"] as const;

const countryNameByCode: Readonly<Record<string, string>> = {
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
        birthDate: new Date(`${seed.birthDate}T00:00:00.000Z`),
        country: countryNameByCode[seed.countryCode] ?? seed.countryCode,
        source: "fotmob",
        rawRef: seed.playerId
      }
    });
  }

  const results = [];
  for (const row of plan.rows) {
    results.push(await setSportsRuPlayerMapping(prisma, {
      priceId: row.priceId,
      playerId: BigInt(row.playerId),
      teamId: BigInt(row.targetTeamId)
    }));
  }

  console.log(JSON.stringify({
    applied: results.length,
    seededPlayers: plan.playerSeeds.length,
    movedSelections: results.reduce((sum, row) => sum + row.selectionSync.movedSelections, 0),
    removedDuplicateSelections: results.reduce((sum, row) => sum + row.selectionSync.removedDuplicateSelections, 0)
  }, bigintJson, 2));
}

async function buildPlan() {
  const leagueIds = [...new Set(sportsRuNetherlandsPortugal2026Mappings.map(([leagueId]) => BigInt(leagueId)))];
  const providerPlayerIds = sportsRuNetherlandsPortugal2026Mappings.map(([, providerPlayerId]) => providerPlayerId);
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
  const seedById = new Map<string, (typeof sportsRuNetherlandsPortugal2026SeedPlayers)[number]>(
    sportsRuNetherlandsPortugal2026SeedPlayers.map((seed) => [seed[0], seed])
  );
  const teamByKey = new Map(seasonTeams.map((entry) => [teamKey(entry.leagueId, entry.team.name), entry]));
  const errors: string[] = [];

  const playerSeeds = [...new Set(targetPlayerIds.map(String))].flatMap((playerId) => {
    if (playerById.has(playerId)) return [];
    const seed = seedById.get(playerId);
    if (!seed) {
      errors.push(`Core FotMob player ${playerId} is missing and has no verified seed profile.`);
      return [];
    }
    return [{
      playerId: seed[0],
      playerName: seed[1],
      birthDate: seed[2],
      countryCode: seed[3]
    }];
  });

  const rows = sportsRuNetherlandsPortugal2026Mappings.flatMap(([
    leagueId,
    providerPlayerId,
    playerId,
    targetTeamName
  ]) => {
    const price = priceByKey.get(mappingKey(BigInt(leagueId), providerPlayerId));
    const team = teamByKey.get(teamKey(BigInt(leagueId), targetTeamName));
    if (!price) errors.push(`Sports.ru price ${leagueId}/${providerPlayerId} was not found.`);
    if (!team) errors.push(`Active target team ${leagueId}/${targetTeamName} was not found.`);
    if (!playerById.has(playerId) && !seedById.has(playerId)) {
      errors.push(`FotMob player ${playerId} was neither found nor seedable.`);
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
      alreadyMapped: price.playerId === BigInt(playerId) && price.teamId === team.teamId
    }];
  });

  if (rows.length !== sportsRuNetherlandsPortugal2026Mappings.length) {
    errors.push(`Resolved ${rows.length} of ${sportsRuNetherlandsPortugal2026Mappings.length} mapping rows.`);
  }
  return { rows, prices, playerSeeds, errors };
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
    plannedPlayerSeeds: plan.playerSeeds,
    prices: plan.prices,
    providerMaps,
    squads
  }, bigintJson, 2), { flag: "wx" });
  return backupPath;
}

function validateStaticData() {
  assertUnique("league/provider", sportsRuNetherlandsPortugal2026Mappings.map(([leagueId, providerId]) => `${leagueId}/${providerId}`));
  assertUnique("target player", sportsRuNetherlandsPortugal2026Mappings.map(([, , playerId]) => playerId));
  assertUnique("seed player", sportsRuNetherlandsPortugal2026SeedPlayers.map(([playerId]) => playerId));
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
