/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#transactions */
import { Prisma, type PrismaClient } from "@prisma/client";
import { apiError } from "@/lib/api-handler";
import { contentHash } from "@/khl/repositories/revisions";
import { previewTransfers, type TransferStep } from "@/khl/transfers";
import { hydratePlayers } from "./read-model";
import { intervalPlanEp } from "@/khl/forecast-model";
function stepsFrom(value: unknown): TransferStep[] {
  if (!Array.isArray(value) || !value.length || value.length > 5) throw apiError("INVALID_INPUT", "Нужно от 1 до 5 шагов", 400);
  return value.map(s => {
    if (!s || typeof s !== "object" || typeof s.out !== "string" || typeof s.in !== "string" || s.out.length > 128 || s.in.length > 128) throw apiError("INVALID_INPUT", "Неверный шаг", 400);
    return { out: s.out, in: s.in };
  });
}
export async function createTransferPreview(db: PrismaClient, userId: string, squadId: string, contestId: string, body: Record<string, unknown>) {
  const steps = stepsFrom(body.steps);
  if (typeof body.weekId !== "string" || !Number.isInteger(body.expectedVersion)) throw apiError("INVALID_INPUT", "Нужна неделя и версия", 400);
  const weekId = body.weekId;
  return db.$transaction(async tx => {
    const squad = await tx.khlUserSquad.findFirst({ where: { id: squadId, userId, contestId }, include: { baseline: true, entries: { include: { player: true }, orderBy: { slotIndex: "asc" } } } });
    if (!squad) throw apiError("NOT_FOUND", "Состав не найден", 404);
    if (squad.revision !== body.expectedVersion) throw apiError("VERSION_CONFLICT", "Состав изменился", 409);
    const week = await tx.khlFantasyWeek.findFirst({ where: { id: weekId, contestId } });
    if (!week) throw apiError("NOT_FOUND", "Неделя не найдена", 404);
    const contest = await tx.khlContest.findUniqueOrThrow({ where: { id: contestId } });
    const candidates = await tx.khlFantasyPlayer.findMany({ where: { contestId, id: { in: [...squad.entries.map(e => e.fantasyPlayerId), ...steps.map(s => s.in)] } } });
    const now = new Date();
    const pool = await hydratePlayers(tx, candidates, { weekId, now });
    const baselineVerified = squad.baseline && squad.baseline.userId === userId && squad.baseline.contestId === contestId && squad.baseline.providerWeekId === week.providerWeekId && now.getTime() - squad.baseline.observedAt.getTime() < 60000;
    const savedPlans = baselineVerified ? await tx.khlTransferScenario.findMany({ where: { squadId, userId, status: "LOCALLY_APPLIED", createdAt: { gte: squad.baseline!.observedAt }, weekId }, select: { steps: true }, take: 100 }) : [];
    const plannedUsed = savedPlans.reduce((n, p) => n + (Array.isArray(p.steps) ? p.steps.length : 0), 0);
    const preview = previewTransfers({ selected: squad.entries.map(e => pool.find(p => p.id === e.fantasyPlayerId)!), pool, bank: squad.bankUnits, used: baselineVerified && squad.baseline!.transfersUsed !== null ? squad.baseline!.transfersUsed + plannedUsed : null, preSeason: false, steps, now: now.getTime() });
    const structural = preview.violations.filter(v => !["UNKNOWN_TRANSFER_BALANCE", "PROVIDER_LOCK", "LOCK_UNKNOWN_OR_STALE", "PRICE_UNKNOWN_OR_STALE", "MATCH_LOCK"].includes(v));
    if (structural.length) throw apiError("INVALID_ROSTER", structural.join(", "), 422);
    const baselineHash = contentHash({ revision: squad.revision, bank: squad.bankUnits, entries: squad.entries.map(e => e.fantasyPlayerId) });
    if (body.baselineHash !== undefined && body.baselineHash !== baselineHash) throw apiError("BASELINE_STALE", "Baseline изменился", 409);
    const forecast = await tx.khlForecastRevision.findFirst({ where: { contestId, dataRevision: contest.revision, status: "PUBLISHED", asOf: { lte: now, gte: new Date(now.getTime() - 3600000) } }, orderBy: { asOf: "desc" }, include: { players: { where: { playerId: { in: candidates.flatMap(p => p.playerId ? [p.playerId] : []) } }, take: 40000 } } });
    const ep = week.endsAt && contest.calendarComplete ? intervalPlanEp({ owned: squad.entries.map(e => e.fantasyPlayerId), steps: steps.map(s => ({ ...s, at: now.getTime() })), games: pool.flatMap(p => p.fixtures.map(f => ({ playerId: p.id, matchId: f.id, startsAt: Date.parse(f.startsAt), status: f.status, ep: forecast?.players.find(v => v.playerId === p.playerId && v.matchId === f.id)?.expectedPoints ?? null }))), asOf: now.getTime(), horizonEnd: week.endsAt.getTime() }) : { baseline: null, planned: null, gain: null, reason: "CALENDAR_INCOMPLETE" };
    const violations = [...preview.violations, ...(!baselineVerified ? ["PROVIDER_BASELINE_UNVERIFIED"] : []), ...(!contest.calendarComplete ? ["CALENDAR_INCOMPLETE"] : []), ...(!week.verified ? ["WEEK_BOUNDARY_UNVERIFIED"] : [])];
    const result = { entries: preview.players.map(p => ({ id: p.id, keepForOptimizer: squad.entries.find(e => e.fantasyPlayerId === p.id)?.keepForOptimizer ?? false })), bankUnits: preview.bank, violations, ep, externalExecuted: false, eligibility: violations.length ? "CONDITIONAL" : "LOCAL_PLAN" };
    const expiresAt = new Date(now.getTime() + 60000);
    const quoteHash = contentHash({ baselineHash, dataRevision: contest.revision, weekRevision: week.revision, prices: candidates.map(p => [p.id, p.priceRevision, p.observedAt]), steps, expiresAt: expiresAt.toISOString() });
    await tx.khlTransferScenario.deleteMany({ where: { userId, status: "PREVIEW", expiresAt: { lt: now } } });
    // Serializes this user's bounded preview queue across tabs/processes.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (await tx.khlTransferScenario.count({ where: { userId, status: "PREVIEW" } }) >= 10) throw apiError("RATE_LIMITED", "Слишком много preview; дождитесь истечения минуты", 429);
    return tx.khlTransferScenario.create({ data: { userId, squadId, expectedVersion: squad.revision, dataRevision: contest.revision, weekId, weekRevision: week.revision, baselineHash, quoteHash, expiresAt, steps: steps as unknown as Prisma.InputJsonValue, result } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
export async function saveTransferPlan(db: PrismaClient, userId: string, squadId: string, contestId: string, body: Record<string, unknown>, key: string | null) {
  if (!key || key.length > 128 || typeof body.quoteHash !== "string" || !Number.isInteger(body.expectedVersion)) throw apiError("INVALID_INPUT", "Нужны quoteHash, expectedVersion и Idempotency-Key", 400);
  const quoteHash = body.quoteHash;
  const requestHash = contentHash({ squadId, contestId, quoteHash: body.quoteHash, expectedVersion: body.expectedVersion });
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const retry = await tx.khlTransferScenario.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
    if (retry) {
      if (retry.requestHash !== requestHash) throw apiError("VERSION_CONFLICT", "Idempotency-Key использован для другого запроса", 409);
      return { ...retry, externalExecuted: false };
    }
    const preview = await tx.khlTransferScenario.findFirst({ where: { userId, squadId, quoteHash, status: "PREVIEW" } });
    if (!preview || preview.expiresAt <= new Date()) throw apiError("BASELINE_STALE", "Preview истёк", 409);
    const squad = await tx.khlUserSquad.findFirst({ where: { id: squadId, userId, contestId } });
    if (!squad) throw apiError("NOT_FOUND", "Состав не найден", 404);
    const contest = await tx.khlContest.findUniqueOrThrow({ where: { id: contestId } });
    const week = await tx.khlFantasyWeek.findFirst({ where: { id: preview.weekId, contestId } });
    if (contest.revision !== preview.dataRevision) throw apiError("PRICE_CHANGED", "Цены или статусы изменились", 409);
    if (!week || week.revision !== preview.weekRevision) throw apiError("WEEK_CHANGED", "Календарь изменился", 409);
    if (squad.revision !== preview.expectedVersion || body.expectedVersion !== squad.revision) throw apiError("VERSION_CONFLICT", "Состав изменился", 409);
    const result = preview.result as { entries: { id: string; keepForOptimizer: boolean }[]; bankUnits: number | null };
    const updated = await tx.khlUserSquad.updateMany({ where: { id: squad.id, userId, revision: squad.revision }, data: { bankUnits: result.bankUnits, revision: { increment: 1 } } });
    if (updated.count !== 1) throw apiError("VERSION_CONFLICT", "Состав изменился", 409);
    await tx.khlUserSquadEntry.deleteMany({ where: { squadId } });
    await tx.khlUserSquadEntry.createMany({ data: result.entries.map((e, slotIndex) => ({ squadId, contestId, fantasyPlayerId: e.id, keepForOptimizer: e.keepForOptimizer, slotIndex })) });
    return { ...await tx.khlTransferScenario.update({ where: { id: preview.id }, data: { status: "LOCALLY_APPLIED", idempotencyKey: key, requestHash } }), externalExecuted: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
