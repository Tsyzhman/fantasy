/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import type { PrismaClient } from "@prisma/client";
import { loadSportsRuPriceSyncScopes, currentEuropeanSeason } from "@/machete/fantasy-source-sync-config";

export function activeFantasyScope(leagueId: bigint, season: string, now = new Date()) {
  // National tournaments have explicit calendars, rather than LeagueSeason.updatedAt.
  if (leagueId === 77n) return season === "2026" && now >= new Date("2026-06-01") && now < new Date("2026-07-20");
  if (leagueId === 44n) return false; // Copa America 2024 is retained as an archive.
  return season === currentEuropeanSeason(now);
}
export async function loadActiveFantasySourceScopes(db: Pick<PrismaClient, "leagueSeason">, now = new Date()) {
  return (await loadSportsRuPriceSyncScopes(db, now)).filter(scope => activeFantasyScope(scope.leagueId, scope.season, now));
}
