/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import { Prisma, type PrismaClient } from "@prisma/client";
import { contentHash } from "@/khl/repositories/revisions";
import { hydratePlayers } from "./read-model";

const MODEL = "khl-fp10-participation-beta-v1";
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
    const history = await tx.khlPlayer.findMany({ where: { id: { in: pool.flatMap(p => p.playerId ? [p.playerId] : []) } }, select: { id: true, stats: { where: { availableAt: { lte: asOf }, match: { seasonId: contest.seasonId, status: "FINAL", startsAt: { lt: asOf } }, participationStatus: { in: ["PLAYED", "DNP"] } }, orderBy: { match: { startsAt: "desc" } }, take: 10, select: { participationStatus: true } } } });
    const rates = new Map(history.map(p => [p.id, p.stats.length ? p.stats.filter(s => s.participationStatus === "PLAYED").length / p.stats.length : null]));
    const inputs = players.flatMap(p => {
      const participation = p.playerId ? rates.get(p.playerId) : null;
      if (!p.playerId || p.officialFp.value === null || participation == null) return [];
      return [{ playerId: p.playerId, mean: p.officialFp.value, participation, fixtures: p.fixtures.filter(f => f.status === "SCHEDULED" && new Date(f.startsAt) < horizonEnd).map(f => f.id) }];
    });
    if (!inputs.some(p => p.fixtures.length)) throw new Error("HISTORY_NOT_READY");
    const inputHash = contentHash({ inputs, dataRevision: contest.revision, asOf: asOf.toISOString() });
    const forecast = await tx.khlForecastRevision.create({ data: { contestId, dataRevision: contest.revision + 1, modelVersion: MODEL, rulesVersion: "provider-official-fp", inputHash, asOf, horizonEnd, status: "PUBLISHED", quality: "BETA_BASELINE", diagnostics: { horizon: "NEXT_7_DAYS", xgReady: false, fittedModel: false, participation: "Empirical appearances including DNP; not probability of starting", warnings: ["SMALL_SAMPLE", "XG_UNAVAILABLE"] } } });
    await tx.khlPlayerMatchForecast.createMany({ data: inputs.flatMap(p => p.fixtures.map(matchId => ({ forecastId: forecast.id, playerId: p.playerId, matchId, expectedPoints: p.mean * p.participation, participationProbability: null, components: { officialFpMean: p.mean, appearanceRate: p.participation }, uncertainty: null }))) });
    await tx.khlContest.update({ where: { id: contestId }, data: { revision: { increment: 1 } } });
    // Restrict FK: remove owned projections before the bounded revision audit window.
    const expired = { contestId, modelVersion: MODEL, asOf: { lt: new Date(asOf.getTime() - 7 * 86400000) } };
    await tx.khlPlayerMatchForecast.deleteMany({ where: { forecast: expired } });
    await tx.khlForecastRevision.deleteMany({ where: expired });
    return forecast;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}
