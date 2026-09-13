/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#api */
import type { KhlFantasyPlayer, Prisma } from "@prisma/client";
import type { KhlPlayer, KhlPosition, Observation, KhlHistoricalStats, KhlForecastExplanation } from "@/khl/contracts";
import { unknown, seasonStatFields, playerStatFields } from "@/khl/contracts";
export const KHL_READINESS = {
  status: "degraded",
  reasons: ["XG_UNAVAILABLE", "STATS_FEED_UNVERIFIED", "WEEK_BOUNDARY_UNVERIFIED", "SCORING_PROVISIONAL", "HOCKEY_ODDS_DICTIONARY_UNVERIFIED", "PROVIDER_TEAM_IMPORT_UNAVAILABLE"],
  coverage: { xg: null, detailedStats: null, odds: null },
  features: { localDrafts: true, verifiedTransfers: false, forecasts: false }
};
export function playerDto(p: KhlFantasyPlayer): KhlPlayer {
  const fact = <T>(value: T | null): Observation<T> => ({ value, quality: value === null ? "UNKNOWN" : "FACT", source: "SPORTS_RU", asOf: p.observedAt.toISOString() });
  return { id: p.id, contestId: p.contestId, playerId: p.playerId, name: p.name, clubId: p.clubId, clubName: p.clubName, position: p.position as KhlPosition,
    price: fact(p.currentPriceUnits), priceRevision: p.priceRevision, priceDelta: p.priceDelta, providerLock: fact(p.providerLock),
    goals: unknown("Нет протокола"), assists: unknown("Нет протокола"), shotsOnGoal: unknown("Нет протокола"), pimMinutes: unknown("Нет протокола"), plusMinus: unknown("Нет протокола"),
    injury: unknown("Источник травм не подключён"), attackZoneSeconds: unknown("Нет времени в атаке в протоколах"), toiSeconds: unknown("Нет протокола"), ppToiSeconds: unknown("Нет протокола"), pkToiSeconds: unknown("Нет протокола"),
    officialFp: unknown("История не импортирована"), ep: unknown("Прогноз не готов"), ixg: unknown("В протоколах нет готового индивидуального xG; отдельный источник пока не подключён"), saves: unknown("Нет протокола"), goalsAgainst: unknown("Нет протокола"), fixtures: [] };
}
export function envelope(contest: { id: string; seasonId: string; revision: number; publishedAt: Date | null }, data: unknown) {
  return { apiVersion: 1, scope: { sport: "ICE_HOCKEY", contestId: contest.id, seasonId: contest.seasonId }, asOf: contest.publishedAt?.toISOString() ?? null, dataRevision: contest.revision, readiness: KHL_READINESS, sources: ["SPORTS_RU"], data };
}

/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#protocol-aggregates
 * Bounded queries, no process-wide cache. All callers may share a repeatable-read transaction. */
export async function hydratePlayers(db: Prisma.TransactionClient, rows: KhlFantasyPlayer[], options: { now?: Date; weekId?: string; historyWindow?: 5 | 10 | 20 } = {}): Promise<KhlPlayer[]> {
  if (!rows.length) return [];
  if (rows.length > 1000 || new Set(rows.map(p => p.contestId)).size !== 1) throw new Error("READ_SCOPE_INVALID");
  const now = options.now ?? new Date();
  const historyWindow = options.historyWindow ?? 10;
  const contestId = rows[0].contestId;
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: contestId }, include: { season: true } });
  const years = /^(\d{4})\/(\d{4})$/.exec(contest.season.seasonKey);
  const previousSeasonKey = years ? `${Number(years[1]) - 1}/${years[1]}` : "unavailable";
  const ids = rows.flatMap(p => p.playerId ? [p.playerId] : []);
  const [details, scores, matches, forecast, seasonTotals] = await Promise.all([
    db.khlPlayer.findMany({ where: { id: { in: ids } }, include: {
      historicalSeasons: { where: { seasonKey: previousSeasonKey, availableAt: { lte: now } }, take: 1 },
      stats: { where: { participationStatus: "PLAYED", availableAt: { lte: now }, match: { seasonId: contest.seasonId, status: "FINAL", startsAt: { lte: now } } }, orderBy: { match: { startsAt: "desc" } }, take: historyWindow },
      availability: { where: { observedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { observedAt: "desc" }, take: 10 },
      xgObservations: { where: { availableAt: { lte: now }, metric: "ixG", strength: "ALL", match: { seasonId: contest.seasonId, status: "FINAL" } }, orderBy: [{ match: { startsAt: "desc" } }, { revision: "desc" }], take: 100 },
      memberships: { where: { seasonId: contest.seasonId }, orderBy: { startsAt: "desc" }, take: 10 }
    } }),
    db.khlFantasyPlayer.findMany({ where: { id: { in: rows.map(p => p.id) } }, select: { id: true, officialScores: { where: { availableAt: { lte: now }, match: { status: "FINAL" } }, orderBy: { match: { startsAt: "desc" } }, take: historyWindow } } }),
    db.khlMatch.findMany({ where: { seasonId: contest.seasonId, startsAt: { gte: now, lt: new Date(now.getTime() + 42 * 86400000) }, ...(options.weekId ? { weeks: { some: { contestId, weekId: options.weekId } } } : {}) }, include: { home: true, away: true, weeks: { where: { contestId } } }, orderBy: { startsAt: "asc" }, take: 500 }),
    db.khlForecastRevision.findFirst({ where: { contestId, dataRevision: contest.revision, status: "PUBLISHED", asOf: { lte: now, gte: new Date(now.getTime() - 3600000) }, horizonEnd: { gt: now } }, orderBy: { asOf: "desc" }, include: { players: { where: { playerId: { in: ids } }, take: 40000 } } }),
    db.khlPlayerMatchStat.groupBy({ by: ["playerId"], where: { playerId: { in: ids }, participationStatus: "PLAYED", availableAt: { lte: now }, match: { seasonId: contest.seasonId, status: "FINAL", startsAt: { lte: now } } },
      _sum: { toiSeconds: true, ppToiSeconds: true, pkToiSeconds: true, attackZoneSeconds: true, goals: true, assists: true, shotsOnGoal: true, blockedShots: true, pimMinutes: true, plusMinus: true, saves: true, goalsAgainst: true },
      _count: { _all: true, toiSeconds: true, ppToiSeconds: true, pkToiSeconds: true, attackZoneSeconds: true, goals: true, assists: true, shotsOnGoal: true, blockedShots: true, pimMinutes: true, plusMinus: true, saves: true, goalsAgainst: true }, _max: { observedAt: true } })
  ]);
  const detailMap = new Map(details.map(p => [p.id, p]));
  const totalMap = new Map(seasonTotals.map(s => [s.playerId, s]));
  const scoreMap = new Map(scores.map(p => [p.id, p.officialScores]));
  return rows.map(row => {
    const dto = playerDto(row), detail = row.playerId ? detailMap.get(row.playerId) : undefined;
    const official = scoreMap.get(row.id) ?? [];
    const total = row.playerId ? totalMap.get(row.playerId) : undefined;
    if (total) dto.seasonStats = { games: total._count._all, asOf: total._max.observedAt?.toISOString() ?? null, totals: Object.fromEntries(seasonStatFields.map(f => [f, { value: total._sum[f], knownGames: total._count[f] }])) as NonNullable<KhlPlayer["seasonStats"]>["totals"] };
    dto.forecastHorizonEnd = forecast?.horizonEnd.toISOString() ?? null;
    if (official.length && official.every(s => s.points !== null)) dto.officialFp = { value: official.reduce((n, s) => n + s.points!, 0) / official.length, quality: "FACT", source: [...new Set(official.map(s => s.source))].join(","), asOf: official.reduce((a, s) => a > s.observedAt ? a : s.observedAt, official[0].observedAt).toISOString(), reason: `Среднее за ${official.length} последних матчей с официальной оценкой` };
    if (!detail) return dto;
    const archive = detail.historicalSeasons[0];
    if (archive) dto.previousSeasonStats = { ...archive.aggregates as unknown as KhlHistoricalStats, asOf: archive.observedAt.toISOString() };
    const explained = forecast?.players.find(p => p.playerId === row.playerId)?.components;
    if (explained && typeof explained === "object" && !Array.isArray(explained) && "perGame" in explained) dto.forecastExplanation = explained as unknown as KhlForecastExplanation;
    const xg = [...new Map([...detail.xgObservations].reverse().map(x => [x.matchId, x])).values()].slice(-historyWindow);
    if (xg.length && xg.every(x => x.value !== null) && new Set(xg.map(x => `${x.source}:${x.definitionVersion}`)).size === 1) dto.ixg = { value: xg.reduce((n, x) => n + x.value!, 0) / xg.length, quality: "FACT", source: `${xg[0].source}:${xg[0].definitionVersion}`, asOf: xg[xg.length - 1].observedAt.toISOString(), reason: `Среднее готового ixG за ${xg.length} матчей` };
    const played = detail.stats.filter(s => s.participationStatus === "PLAYED");
    for (const field of playerStatFields) {
      const known = played.filter(s => s[field] !== null);
      dto[field] = { ...dto[field]!, knownGames: known.length, totalGames: played.length };
      if (known.length) {
        const mean = known.reduce((n, s) => n + s[field]!, 0) / known.length;
        dto[field] = { value: field.endsWith("Seconds") ? Math.round(mean) : mean, quality: "FACT", source: [...new Set(known.flatMap(s => s.sources && typeof s.sources === "object" && !Array.isArray(s.sources) && typeof s.sources[field] === "string" ? [s.sources[field] as string] : []))].join(",") || null, asOf: known.reduce<Date | null>((latest, s) => s.observedAt && (!latest || s.observedAt > latest) ? s.observedAt : latest, null)?.toISOString() ?? null, knownGames: known.length, totalGames: played.length, reason: `Среднее по известным данным: ${known.length} из ${played.length} последних сыгранных матчей` };
      }
    }
    const injury = detail.availability.find(a => a.field === "injury");
    if (injury && (typeof injury.value === "string" || injury.value === null)) dto.injury = { value: injury.value as string | null, quality: injury.quality === "FACT" ? "FACT" : injury.quality === "ESTIMATE" ? "ESTIMATE" : "UNKNOWN", source: injury.source, asOf: injury.observedAt.toISOString() };
    dto.fixtures = matches.flatMap(match => {
      const membership = detail.memberships.find(m => m.startsAt <= match.startsAt && (!m.endsAt || m.endsAt > match.startsAt));
      if (!membership || membership.teamId !== match.homeId && membership.teamId !== match.awayId || !["SCHEDULED", "LIVE", "FINAL", "POSTPONED", "CANCELLED"].includes(match.status)) return [];
      const projection = forecast?.players.find(p => p.playerId === row.playerId && p.matchId === match.id);
      return [{ id: match.id, weekId: match.weeks[0]?.weekId ?? "", startsAt: match.startsAt.toISOString(), opponent: membership.teamId === match.homeId ? match.away.name : match.home.name, status: match.status as KhlPlayer["fixtures"][number]["status"], expectedPoints: projection?.expectedPoints != null ? { value: projection.expectedPoints, quality: "ESTIMATE" as const, source: forecast!.modelVersion, asOf: forecast!.asOf.toISOString(), reason: forecast!.quality } : unknown<number>("Прогноз матча не готов"), startProbability: projection?.participationProbability != null ? { value: projection.participationProbability, quality: "ESTIMATE" as const, source: forecast!.modelVersion, asOf: forecast!.asOf.toISOString() } : unknown<number>("Нет подтверждённой вероятности участия") }];
    });
    const fixtureIds = new Set(dto.fixtures.filter(f => f.status === "SCHEDULED" && forecast && new Date(f.startsAt) < forecast.horizonEnd).map(f => f.id));
    const projections = forecast?.players.filter(p => p.playerId === row.playerId && fixtureIds.has(p.matchId)) ?? [];
    if (fixtureIds.size && projections.length === fixtureIds.size && projections.every(p => p.expectedPoints !== null)) dto.ep = { value: projections.reduce((n, p) => n + p.expectedPoints!, 0), quality: "ESTIMATE", source: forecast!.modelVersion, asOf: forecast!.asOf.toISOString(), reason: `Горизонт: ${fixtureIds.size} матчей; ${forecast!.quality}` };
    return dto;
  });
}

export async function readiness(db: Prisma.TransactionClient, contestId: string) {
  const [contest, contracts, rules, weeks, forecast] = await Promise.all([
    db.khlContest.findUniqueOrThrow({ where: { id: contestId } }), db.khlSourceContract.findMany({ take: 100 }),
    db.khlRuleset.findFirst({ where: { contestId }, orderBy: { fetchedAt: "desc" } }),
    db.khlFantasyWeek.count({ where: { contestId, verified: true } }),
    db.khlForecastRevision.findFirst({ where: { contestId, status: "PUBLISHED", asOf: { gte: new Date(Date.now() - 3600000) } }, orderBy: { asOf: "desc" } })
  ]);
  const ready = (provider: string) => contracts.some(c => c.provider === provider && c.permissionStatus === "VERIFIED" && c.health === "HEALTHY" && c.verifiedAt && c.lastSuccessAt && Date.now() - c.lastSuccessAt.getTime() < 86400000);
  const reasons = [!contest.catalogComplete && "CATALOG_INCOMPLETE", !contest.calendarComplete && "CALENDAR_INCOMPLETE", !weeks && "WEEK_BOUNDARY_UNVERIFIED", !rules?.verifiedAt && "SCORING_PROVISIONAL", !ready("KHL_XG") && "XG_UNAVAILABLE", !ready("KHL_STATS") && "STATS_FEED_UNVERIFIED", !ready("FONBET_HOCKEY") && "HOCKEY_ODDS_DICTIONARY_UNVERIFIED", !ready("SPORTS_RU_TEAM") && "PROVIDER_TEAM_IMPORT_UNAVAILABLE"].filter((v): v is string => !!v);
  return { status: reasons.length ? "degraded" : "ready", reasons, features: { localDrafts: true, verifiedTransfers: ready("SPORTS_RU_TEAM") && !!weeks, forecasts: !!forecast && contest.calendarComplete }, coverage: Object.fromEntries(contracts.map(c => [c.provider, c.coverage])) };
}
