import { PrismaClient } from "@prisma/client";

import { cacheFotMobPlayerPhoto, cachedPlayerPhotoExists, playerPhotoCacheDirectory } from "../src/machete/player-photo-cache";

const prisma = new PrismaClient();
const domesticFantasyLeagueIds = [47n, 87n, 54n, 55n, 53n, 63n, 71n, 48n, 57n, 61n];
const concurrency = Math.max(1, Math.min(24, Number(process.env.PLAYER_PHOTO_CONCURRENCY ?? 12)));
const force = process.argv.includes("--force");

type PhotoCandidate = { playerId: bigint; photoUrl: string | null };

async function currentDomesticScopes() {
  const seasons = await prisma.leagueSeason.findMany({
    where: { leagueId: { in: domesticFantasyLeagueIds } },
    select: { leagueId: true, season: true, isCurrent: true, updatedAt: true },
    orderBy: [{ leagueId: "asc" }, { isCurrent: "desc" }, { updatedAt: "desc" }]
  });
  const newestByLeague = new Map<string, { leagueId: bigint; season: string }>();
  for (const season of seasons) {
    const key = String(season.leagueId);
    if (!newestByLeague.has(key)) newestByLeague.set(key, { leagueId: season.leagueId, season: season.season });
  }
  return [...newestByLeague.values()];
}

async function candidates(): Promise<PhotoCandidate[]> {
  const scopes = await currentDomesticScopes();
  if (scopes.length === 0) return [];
  const rows = await prisma.teamPlayerSeason.findMany({
    where: {
      active: true,
      OR: scopes.map((scope) => ({ leagueId: scope.leagueId, season: scope.season })),
      photoUrl: { not: null }
    },
    select: { playerId: true, photoUrl: true },
    distinct: ["playerId"],
    orderBy: { playerId: "asc" }
  });
  return rows;
}

async function main() {
  const rows = await candidates();
  const result = { total: rows.length, downloaded: 0, skipped: 0, failed: 0, bytes: 0 };
  let cursor = 0;

  console.log(JSON.stringify({ event: "player_photo_cache_start", directory: playerPhotoCacheDirectory(), concurrency, total: rows.length }));
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        const playerId = String(row.playerId);
        if (!force && await cachedPlayerPhotoExists(playerId)) {
          result.skipped += 1;
          continue;
        }
        try {
          const photo = await cacheFotMobPlayerPhoto(playerId, row.photoUrl ?? undefined);
          result.downloaded += 1;
          result.bytes += photo.length;
        } catch (error) {
          result.failed += 1;
          console.error(JSON.stringify({ event: "player_photo_cache_failed", playerId, error: error instanceof Error ? error.message : String(error) }));
        }
        const processed = result.downloaded + result.skipped + result.failed;
        if (processed > 0 && processed % 250 === 0) console.log(JSON.stringify({ event: "player_photo_cache_progress", processed, ...result }));
      }
    })
  );
  console.log(JSON.stringify({ event: "player_photo_cache_complete", ...result }));
  if (result.failed > Math.max(50, Math.ceil(result.total * 0.03))) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
