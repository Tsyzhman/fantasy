/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#optimizer */
import { Prisma, type PrismaClient } from "@prisma/client";
import { apiError } from "@/lib/api-handler";
import { hydratePlayers } from "./read-model";
import { transferAvailability, validateRoster } from "@/khl/rules";
import type { OptimizeInput } from "@/khl/optimizer";
import { unknown } from "@/khl/contracts";

export async function prepareOptimization(db: PrismaClient, userId: string, contestId: string, body: Record<string, unknown>) {
  if (typeof body.squadId !== "string" || typeof body.weekId !== "string") throw apiError("INVALID_INPUT", "Сначала сохраните состав и выберите неделю", 400);
  const squadId = body.squadId, weekId = body.weekId;
  return db.$transaction(async tx => {
    const squad = await tx.khlUserSquad.findFirst({ where: { id: squadId, userId, contestId }, include: { entries: true, baseline: true } });
    if (!squad) throw apiError("NOT_FOUND", "Состав не найден", 404);
    if (body.expectedVersion !== squad.revision) throw apiError("VERSION_CONFLICT", "Сохраните изменения состава", 409);
    const contest = await tx.khlContest.findUniqueOrThrow({ where: { id: contestId } });
    const week = await tx.khlFantasyWeek.findFirst({ where: { id: weekId, contestId } });
    if (!contest.calendarComplete || !week?.verified) throw apiError("SOURCE_UNAVAILABLE", "Нужны полный календарь и подтверждённая неделя", 503);
    const horizonWeeks = Number(body.horizonWeeks ?? 1);
    if (!Number.isInteger(horizonWeeks) || horizonWeeks < 1 || horizonWeeks > 4 || !week.startsAt) throw apiError("INVALID_INPUT", "Горизонт: 1–4 официальных недели", 400);
    const horizon = await tx.khlFantasyWeek.findMany({ where: { contestId, startsAt: { gte: week.startsAt } }, orderBy: { startsAt: "asc" }, take: horizonWeeks });
    if (horizon.length !== horizonWeeks || horizon.some(w => !w.verified || !w.endsAt || !contest.calendarTo || w.endsAt > contest.calendarTo)) throw apiError("SOURCE_UNAVAILABLE", "Календарь не покрывает весь горизонт", 503);
    const rows = await tx.khlFantasyPlayer.findMany({ where: { contestId, active: true }, take: 1001, orderBy: { id: "asc" } });
    if (rows.length > 1000) throw apiError("POOL_TOO_LARGE", "Пул превышает безопасный предел", 422);
    const now = new Date();
    const players = (await hydratePlayers(tx, rows, { now })).map(p => {
      const fixtures = p.fixtures.filter(f => horizon.some(w => w.id === f.weekId));
      const scheduled = fixtures.filter(f => f.status === "SCHEDULED");
      return { ...p, fixtures, ep: scheduled.length && scheduled.every(f => f.expectedPoints?.value != null) ? { ...scheduled[0].expectedPoints!, value: scheduled.reduce((n, f) => n + f.expectedPoints!.value!, 0) } : unknown<number>("Прогноз не покрывает горизонт") };
    });
    if (!players.some(p => p.ep.value !== null)) throw apiError("SOURCE_UNAVAILABLE", "Нет опубликованного прогноза выбранной недели", 503);
    const owned = squad.entries.map(e => e.fantasyPlayerId);
    const holdings = players.filter(p => owned.includes(p.id));
    const baseline = squad.baseline;
    const verified = baseline && baseline.userId === userId && baseline.contestId === contestId && baseline.providerWeekId === week.providerWeekId && now.getTime() - baseline.observedAt.getTime() < 60000;
    const capital = verified && squad.bankUnits !== null && holdings.every(p => p.price.value !== null) ? squad.bankUnits + holdings.reduce((n, p) => n + p.price.value!, 0) : 20000;
    const plans = verified ? await tx.khlTransferScenario.findMany({ where: { squadId, userId, weekId, status: "LOCALLY_APPLIED", createdAt: { gte: baseline.observedAt } }, select: { steps: true }, take: 100 }) : [];
    const plannedUsed = plans.reduce((n, p) => n + (Array.isArray(p.steps) ? p.steps.length : 0), 0);
    const maxTransfers = verified && baseline.transfersUsed !== null ? Math.max(0, 5 - baseline.transfersUsed - plannedUsed) : 17;
    const exclude = body.exclude ?? [];
    if (!Array.isArray(exclude) || exclude.length > 1000 || exclude.some(id => typeof id !== "string" || !players.some(p => p.id === id))) throw apiError("INVALID_INPUT", "Неверные исключения", 400);
    const input: OptimizeInput = { players, capital, keep: squad.entries.filter(e => e.keepForOptimizer).map(e => e.fantasyPlayerId), exclude: exclude as string[], owned, maxTransfers, now: now.getTime(), timeoutMs: 5000 };
    if (body.proposal !== undefined) {
      if (body.dataRevision !== contest.revision || body.weekRevision !== week.revision) throw apiError("VERSION_CONFLICT", "Данные подбора изменились", 409);
      if (!Array.isArray(body.proposal) || body.proposal.length !== 17 || new Set(body.proposal).size !== 17) throw apiError("INVALID_INPUT", "Нужно 17 разных игроков", 400);
      const proposal = body.proposal as string[];
      const chosen = players.filter(p => proposal.includes(p.id));
      const locked = holdings.filter(p => transferAvailability(p, now.getTime())).map(p => p.id);
      const violations = validateRoster(chosen, capital);
      if (chosen.some(p => p.ep.value === null || !p.playerId || input.exclude.includes(p.id) || !owned.includes(p.id) && transferAvailability(p, now.getTime())) || [...input.keep, ...locked].some(id => !proposal.includes(id)) || chosen.filter(p => !owned.includes(p.id)).length > maxTransfers) violations.push("PROPOSAL_STALE");
      if (violations.length) throw apiError("INVALID_ROSTER", violations.join(", "), 422);
      return { valid: true, entries: proposal.map(id => ({ id, keepForOptimizer: input.keep.includes(id) })), bankUnits: capital - chosen.reduce((n, p) => n + p.price.value!, 0), eligibility: verified ? "LOCAL_PLAN" : "CONDITIONAL_DRAFT", externalExecuted: false };
    }
    return { input, dataRevision: contest.revision, weekRevision: week.revision, expectedVersion: squad.revision, eligibility: verified ? "LOCAL_PLAN" : "CONDITIONAL_DRAFT", externalExecuted: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
}
