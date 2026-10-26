/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import type { PrismaClient } from "@prisma/client";
import { loadActiveFantasySourceScopes, activeFantasyScope } from "./fantasy-source-registry";
export async function loadHomeSourceFreshness(db: PrismaClient, userId: string) {
  const active = await loadActiveFantasySourceScopes(db);
  const selected = await db.userFantasySquad.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 4, select: { leagueId: true, season: true } });
  const scopes = [...new Map([...selected, ...active].map(({ leagueId, season }) => [`${leagueId}:${season}`, { leagueId, season }])).values()].slice(0, 4);
  return Promise.all(scopes.map(async scope => {
    const [league, prices, stats, lineups, forecast] = await Promise.all([
      db.leagueSeason.findUnique({ where: { leagueId_season: scope }, include: { league: true } }),
      db.fantasyContest.aggregate({ where: { ...scope, provider: "SPORTS_RU" }, _max: { lastSyncedAt: true } }),
      db.coreMatch.aggregate({ where: { ...scope, finished: true, normalizedAt: { not: null }, playerStats: { some: {} } }, _max: { rawReceivedAt: true } }),
      db.leagueSeasonTeam.aggregate({ where: scope, _max: { startingXiChangedAt: true } }),
      db.fantasyModelForecast.aggregate({ where: { ...scope, points: { not: null } }, _max: { calculatedAt: true } }),
    ]);
    return { ...scope, name: league?.name ?? league?.league.name ?? String(scope.leagueId), country: league?.country ?? league?.league.country,
      isCurrent: activeFantasyScope(scope.leagueId, scope.season),
      sources: { prices: prices._max.lastSyncedAt, stats: stats._max.rawReceivedAt, lineups: lineups._max.startingXiChangedAt, forecast: forecast._max.calculatedAt } };
  }));
}
export function sourceAgeStatus(date: Date | null, maximumAgeHours: number, now = new Date()) {
  if (!date) return "MISSING";
  const age = now.getTime() - date.getTime();
  return age >= 0 && age <= maximumAgeHours * 3_600_000 ? "FRESH" : "STALE";
}
