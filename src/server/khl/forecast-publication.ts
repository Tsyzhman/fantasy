/** Explicit beta publication; genuine xG model requires independent evidence and evaluation. */
import { Prisma, type PrismaClient } from "@prisma/client";
import { contentHash } from "@/khl/repositories/revisions";
import { hydratePlayers } from "./read-model";
export async function publishBaseline(db: PrismaClient, contestId: string, weekId: string | string[], asOf: Date) {
  const weekIds = typeof weekId === "string" ? weekId.split(",") : weekId;
  if (!weekIds.length || weekIds.length > 4 || new Set(weekIds).size !== weekIds.length) throw new Error("HORIZON_INVALID");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM khl_contests WHERE id = ${contestId} FOR UPDATE`;
    const contest = await tx.khlContest.findUniqueOrThrow({ where: { id: contestId } });
    const weeks = await tx.khlFantasyWeek.findMany({ where: { id: { in: weekIds }, contestId }, orderBy: { endsAt: "asc" } });
    if (!contest.calendarComplete || weeks.length !== weekIds.length || weeks.some(week => !week.verified || !week.startsAt || !week.endsAt || week.endsAt <= asOf || !contest.calendarFrom || !contest.calendarTo || week.startsAt < contest.calendarFrom || week.endsAt > contest.calendarTo)) throw new Error("CALENDAR_NOT_READY");
    const rows = await tx.khlFantasyPlayer.findMany({ where: { contestId, active: true }, take: 1001 });
    const players = await hydratePlayers(tx, rows, { now: asOf });
    const inputs = players.filter(p => p.playerId && p.officialFp.value !== null).map(p => ({ id: p.playerId!, mean: p.officialFp.value!, source: p.officialFp.asOf, fixtures: p.fixtures.filter(f => f.status === "SCHEDULED" && weekIds.includes(f.weekId)).map(f => f.id) }));
    if (!inputs.length) throw new Error("HISTORY_NOT_READY");
    const inputHash = contentHash({ inputs, weekRevisions: weeks.map(w => [w.id, w.revision]), asOf: asOf.toISOString() });
    const prior = await tx.khlForecastRevision.findUnique({ where: { contestId_modelVersion_inputHash: { contestId, modelVersion: "khl-fp10-baseline-v1", inputHash } } });
    if (prior) return prior;
    const forecast = await tx.khlForecastRevision.create({ data: { contestId, dataRevision: contest.revision + 1, modelVersion: "khl-fp10-baseline-v1", rulesVersion: "provider-official-fp", inputHash, asOf, horizonEnd: weeks[weeks.length - 1].endsAt!, status: "PUBLISHED", quality: "BETA_BASELINE", diagnostics: { xgReady: false, fittedModel: false, weekIds, warnings: ["BETA_BASELINE", "XG_UNAVAILABLE"] } } });
    await tx.khlPlayerMatchForecast.createMany({ data: inputs.flatMap(p => p.fixtures.map(matchId => ({ forecastId: forecast.id, playerId: p.id, matchId, expectedPoints: p.mean, components: { officialFpMean: p.mean }, participationProbability: null, uncertainty: null }))) });
    await tx.khlContest.update({ where: { id: contestId }, data: { revision: { increment: 1 } } });
    return forecast;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
