/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import { Prisma, type PrismaClient } from "@prisma/client";
import { contentHash } from "@/khl/repositories/revisions";
import { hydratePlayers } from "./read-model";
import { projectHistory, summarizeHockeyHistory } from "@/khl/history-projection";

const MODEL = "khl-history-protocols-beta-v3";
export async function publishRollingForecast(db: PrismaClient, contestId: string, asOf = new Date()) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM khl_contests WHERE id = ${contestId} FOR UPDATE`;
    const contest = await tx.khlContest.findUniqueOrThrow({ where: { id: contestId } });
    const horizonEnd = new Date(asOf.getTime() + 7 * 86400000);
    if (!contest.calendarComplete || !contest.calendarFrom || contest.calendarFrom > asOf || !contest.calendarTo || contest.calendarTo < horizonEnd) throw new Error("CALENDAR_NOT_READY");
    const fresh = await tx.khlForecastRevision.findFirst({ where: { contestId, modelVersion: MODEL, dataRevision: contest.revision, status: "PUBLISHED", asOf: { gte: new Date(asOf.getTime() - 30 * 60000), lte: asOf } }, orderBy: { asOf: "desc" } });
    if (fresh) return fresh;
    const pool = await tx.khlFantasyPlayer.findMany({ where: { contestId, active: true }, take: 1001 });
    const players = await hydratePlayers(tx, pool, { now: asOf });
    const history = await tx.khlPlayer.findMany({ where: { id: { in: pool.flatMap(p => p.playerId ? [p.playerId] : []) } }, select: { id: true, stats: { where: { availableAt: { lte: asOf }, match: { seasonId: contest.seasonId, status: "FINAL", startsAt: { lt: asOf } }, participationStatus: { in: ["PLAYED", "DNP"] } }, orderBy: { match: { startsAt: "desc" } }, take: 10 } } });
    const scores = await tx.khlOfficialFantasyScore.findMany({ where: { contestId, availableAt: { lte: asOf }, matchId: { in: [...new Set(history.flatMap(p => p.stats.map(s => s.matchId)))] } }, take: 10001 });
    if (scores.length > 10000) throw new Error("HISTORY_POOL_LIMIT");
    const scoreMap = new Map(scores.map(s => [`${s.fantasyPlayerId}:${s.matchId}`, s.points]));
    const historyMap = new Map(history.map(p => [p.id, p.stats]));
    const paired = (stats: typeof history[number]["stats"]) => stats.filter(s => s.participationStatus === "PLAYED" && s.goals !== null && s.shotsOnGoal !== null && s.goals >= 0 && s.goals <= s.shotsOnGoal);
    const leaguePairs = paired(history.flatMap(p => p.stats));
    const leagueGoals = leaguePairs.reduce((n, s) => n + s.goals!, 0), leagueShots = leaguePairs.reduce((n, s) => n + s.shotsOnGoal!, 0);
    const inputs = players.flatMap(p => {
      if (!p.playerId) return [];
      const stats = historyMap.get(p.playerId) ?? [], pairs = paired(stats);
      const current = summarizeHockeyHistory(stats.map(s => ({ ...s, points: scoreMap.get(`${p.id}:${s.matchId}`) ?? null })), "current", "SPORTS_RU/KHL");
      const explanation = projectHistory({ position: p.position, current, previous: p.previousSeasonStats, pairedGoals: pairs.reduce((n, s) => n + s.goals!, 0), pairedShots: pairs.reduce((n, s) => n + s.shotsOnGoal!, 0), leagueGoals, leagueShots });
      if (!explanation) return [];
      return [{ playerId: p.playerId, explanation, fixtures: p.fixtures.filter(f => f.status === "SCHEDULED" && new Date(f.startsAt) < horizonEnd).map(f => f.id) }];
    });
    if (!inputs.some(p => p.fixtures.length)) throw new Error("HISTORY_NOT_READY");
    const inputHash = contentHash({ inputs, dataRevision: contest.revision, asOf: asOf.toISOString() });
    const forecast = await tx.khlForecastRevision.create({ data: { contestId, dataRevision: contest.revision + 1, modelVersion: MODEL, rulesVersion: "provider-official-fp", inputHash, asOf, horizonEnd, status: "PUBLISHED", quality: "BETA_BASELINE", diagnostics: { horizon: "NEXT_7_DAYS", xgReady: false, fittedModel: false, participation: "Empirical appearances with previous-season prior; not probability of starting", historicalPlayers: inputs.filter(p => p.explanation.previousGames > 0).length, warnings: ["BETA_UNCALIBRATED", "XG_UNAVAILABLE"] } } });
    await tx.khlPlayerMatchForecast.createMany({ data: inputs.flatMap(p => p.fixtures.map(matchId => ({ forecastId: forecast.id, playerId: p.playerId, matchId, expectedPoints: p.explanation.perGame * p.explanation.appearanceRate, participationProbability: null, components: p.explanation as unknown as Prisma.InputJsonValue, uncertainty: null }))) });
    await tx.khlContest.update({ where: { id: contestId }, data: { revision: { increment: 1 } } });
    // Restrict FK: remove owned projections before the bounded revision audit window.
    const expired = { contestId, modelVersion: { in: [MODEL, "khl-history-components-beta-v2", "khl-fp10-participation-beta-v1"] }, asOf: { lt: new Date(asOf.getTime() - 7 * 86400000) } };
    await tx.khlPlayerMatchForecast.deleteMany({ where: { forecast: expired } });
    await tx.khlForecastRevision.deleteMany({ where: expired });
    return forecast;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}
