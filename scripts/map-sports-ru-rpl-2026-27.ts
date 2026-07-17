import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { setSportsRuPlayerMapping } from "@/machete/sports_ru_player_mapping";

const prisma = new PrismaClient();
const leagueId = 63n;
const season = "2026/2027";
const apply = process.argv.includes("--apply");

// Manually verified against Sports.ru identity data, live FotMob profiles and
// the active production FotMob roster for this exact league season.
const mappings = [
  ["67319", "1431809"], ["67351", "638772"], ["67397", "1382358"],
  ["67408", "1554116"], ["67416", "1792323"], ["67430", "1036575"],
  ["67438", "689051"], ["67444", "1213750"], ["67471", "1176214"],
  ["67472", "846063"], ["67473", "1320168"], ["67474", "1458712"],
  ["67477", "1271367"], ["67488", "975220"], ["67489", "493731"],
  ["67497", "1108837"], ["67504", "206825"], ["67506", "890503"],
  ["67525", "884395"], ["67560", "678629"], ["67583", "1235639"],
  ["67585", "1252233"], ["67591", "1668308"], ["67592", "729187"],
  ["67631", "267367"], ["67650", "1693155"], ["67665", "1245978"],
  ["67668", "1133755"], ["67675", "827669"], ["67683", "987142"],
  ["67687", "407765"], ["67690", "717557"], ["67697", "561200"],
  ["67730", "690096"], ["67732", "653592"], ["67750", "1636880"],
  ["67752", "1606580"]
] as const;

async function main() {
  const providerPlayerIds = mappings.map(([providerPlayerId]) => providerPlayerId);
  const targetPlayerIds = mappings.map(([, playerId]) => BigInt(playerId));
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: { provider: "SPORTS_RU", leagueId, season, providerPlayerId: { in: providerPlayerIds } },
    orderBy: { providerPlayerId: "asc" }
  });
  const roster = await prisma.teamPlayerSeason.findMany({
    where: { leagueId, season, active: true, playerId: { in: targetPlayerIds } },
    include: { player: true, team: true }
  });
  const priceByProviderId = new Map(prices.map((price) => [price.providerPlayerId, price]));
  const rosterByPlayerId = new Map(roster.map((entry) => [String(entry.playerId), entry]));
  const errors: string[] = [];
  const plan = mappings.map(([providerPlayerId, playerId]) => {
    const price = priceByProviderId.get(providerPlayerId) ?? null;
    const rosterEntry = rosterByPlayerId.get(playerId) ?? null;
    if (!price) errors.push(`Sports.ru price ${providerPlayerId} was not found exactly once.`);
    if (!rosterEntry) errors.push(`Active RPL roster player ${playerId} was not found exactly once.`);
    return {
      providerPlayerId,
      playerId,
      sportsName: price?.playerName ?? null,
      fotmobName: rosterEntry?.player.name ?? null,
      team: rosterEntry?.team.name ?? null,
      priceId: price?.id ?? null,
      previousPlayerId: price?.playerId ? String(price.playerId) : null,
      previousTeamId: price?.teamId ? String(price.teamId) : null,
      alreadyMapped: price?.playerId === BigInt(playerId) && price?.teamId === rosterEntry?.teamId
    };
  });

  console.log(JSON.stringify({ apply, mappings: mappings.length, errors, changes: plan.filter((row) => !row.alreadyMapped).length, plan }, null, 2));
  if (errors.length > 0) throw new Error(`Mapping plan failed validation with ${errors.length} error(s).`);
  if (!apply) return;

  const affectedPriceIds = prices.map((price) => price.id);
  const [providerMaps, squads] = await Promise.all([
    prisma.providerEntityMap.findMany({
      where: { provider: "SPORTS_RU", providerEntityType: "FANTASY_PLAYER_PRICE", providerEntityId: { in: affectedPriceIds }, internalEntityType: "PLAYER" }
    }),
    prisma.userFantasySquad.findMany({
      where: { leagueId, season },
      include: { players: true }
    })
  ]);
  const backupDir = process.env.MAPPING_BACKUP_DIR || path.join(process.cwd(), "output", "mapping-backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `sports-ru-rpl-2026-27-${stamp}.json`);
  await writeFile(backupPath, JSON.stringify({ prices, providerMaps, squads }, bigintJson, 2), { flag: "wx" });
  console.log(`Backup written: ${backupPath}`);

  const results = [];
  for (const row of plan) {
    results.push(await setSportsRuPlayerMapping(prisma, { priceId: row.priceId!, playerId: BigInt(row.playerId) }));
  }
  console.log(JSON.stringify({ applied: results.length, results }, bigintJson, 2));
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
