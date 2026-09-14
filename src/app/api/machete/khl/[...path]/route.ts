/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#api */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiError, requiredStringParam, withApiHandler } from "@/lib/api-handler";
import { readKhlBody, requireKhlUser } from "@/server/khl/access";
import { envelope, KHL_READINESS, playerDto, hydratePlayers, readiness } from "@/server/khl/read-model";
import { validateRoster } from "@/khl/rules";
import { createTransferPreview, saveTransferPlan } from "@/server/khl/transfer-plans";
import { prepareOptimization } from "@/server/khl/optimizer-service";
import { importSportsHockeySquad } from "@/server/khl/sports-import";
import { importOwnedProviderSnapshot } from "@/server/khl/provider-snapshot";
import { buildKhlWorkbook, loadKhlExport } from "@/server/khl/player-export";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
const response = (value: unknown) => NextResponse.json(value, { headers: { "Cache-Control": "private, no-store" } });
export const GET = withApiHandler(async (request: Request, context: Context) => {
  const auth = await requireKhlUser(request);
  if (auth.response) return auth.response;
  const { path } = await context.params;
  const params = new URL(request.url).searchParams;
  if (path.length === 1 && path[0] === "contests") return response({ apiVersion: 1, data: await prisma.khlContest.findMany({ include: { season: true }, take: 100 }), readiness: KHL_READINESS });
  const contestId = requiredStringParam(params.get("contestId"), "contestId");
  const contest = await prisma.khlContest.findUnique({ where: { id: contestId } });
  if (!contest) throw apiError("NOT_FOUND", "Турнир не найден", 404);
  if (path[0] === "readiness") { const state = await readiness(prisma, contestId); return response({ ...envelope(contest, state), readiness: state }); }
  if (path[0] === "preferences") return response(envelope(contest, await prisma.khlUserViewPreference.findUnique({ where: { userId_contestId_viewKey: { userId: auth.user.id, contestId, viewKey: "planner" } } })));
  if (path[0] === "weeks") return response(envelope(contest, await prisma.khlFantasyWeek.findMany({ where: { contestId }, orderBy: { providerWeekId: "asc" }, take: 100 })));
  if (path[0] === "calendar") {
    const weekId = requiredStringParam(params.get("weekId"), "weekId");
    return response(envelope(contest, await prisma.khlMatchFantasyWeek.findMany({ where: { contestId, weekId }, include: { match: { include: { home: true, away: true } } }, take: 200 })));
  }
  if (path.length === 1 && path[0] === "players-export") {
    const historyWindow = Number(params.get("historyWindow") ?? 10);
    if (![5, 10, 20].includes(historyWindow)) throw apiError("INVALID_INPUT", "Окно истории: 5, 10 или 20 матчей", 400);
    const snapshot = await loadKhlExport(prisma, contestId, historyWindow as 5 | 10 | 20);
    const bytes = await buildKhlWorkbook(snapshot);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="khl-all-players-${snapshot.asOf.slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Export-Row-Count": String(snapshot.players.length),
      "X-Pool-Revision": String(snapshot.revision),
    } });
  }
  if (path[0] === "players") {
    const historyWindow = Number(params.get("historyWindow") ?? 10);
    if (![5, 10, 20].includes(historyWindow)) throw apiError("INVALID_INPUT", "Окно истории: 5, 10 или 20 матчей", 400);
    if (path[1]) {
      const player = await prisma.khlFantasyPlayer.findFirst({ where: { id: path[1], contestId } });
      if (!player) throw apiError("NOT_FOUND", "Игрок не найден", 404);
      if (path[2] === "history") {
        const [stats, scores, prices] = await Promise.all([
          player.playerId ? prisma.khlPlayerMatchStat.findMany({ where: { playerId: player.playerId, match: { seasonId: contest.seasonId } }, include: { match: { include: { home: true, away: true } } }, orderBy: { match: { startsAt: "desc" } }, take: 20 }) : [],
          prisma.khlOfficialFantasyScore.findMany({ where: { fantasyPlayerId: player.id, contestId }, orderBy: { match: { startsAt: "desc" } }, take: 20 }),
          prisma.khlObservationRevision.findMany({ where: { streamId: `SPORTS_RU:catalog:${contestId}:${player.providerPlayerId}` }, orderBy: { sequence: "desc" }, take: 20 })
        ]);
        return response(envelope(contest, { stats, scores, prices }));
      }
      return response(envelope(contest, (await hydratePlayers(prisma, [player], { weekId: params.get("weekId") ?? undefined, historyWindow: historyWindow as 5 | 10 | 20 }))[0]));
    }
    const limit = Number(params.get("limit") ?? 50);
    const position = params.get("position");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || position && !["G", "D", "F"].includes(position)) throw apiError("INVALID_INPUT", "Неверный limit/position", 400);
    const cursor = params.get("cursor");
    const where = { contestId, ...(position ? { position } : {}), ...(cursor ? { id: { gt: cursor } } : {}) };
    const snapshot = await prisma.$transaction(async tx => {
      const snapshotContest = await tx.khlContest.findUniqueOrThrow({ where: { id: contestId } });
      const players = await tx.khlFantasyPlayer.findMany({ where, orderBy: { id: "asc" }, take: limit + 1 });
      return envelope(snapshotContest, { players: await hydratePlayers(tx, players.slice(0, limit), { weekId: params.get("weekId") ?? undefined, historyWindow: historyWindow as 5 | 10 | 20 }), nextCursor: players.length > limit ? players[limit - 1].id : null, poolRevision: snapshotContest.revision });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return response(snapshot);
  }
  if (path[0] === "squads") {
    const squads = await prisma.khlUserSquad.findMany({ where: { userId: auth.user.id, contestId, ...(path[1] ? { id: path[1] } : {}) }, include: { entries: { orderBy: { slotIndex: "asc" } } }, take: 100 });
    if (path[1] && !squads.length) throw apiError("NOT_FOUND", "Состав не найден", 404);
    return response(envelope(contest, path[1] ? squads[0] : squads));
  }
  throw apiError("NOT_FOUND", "Маршрут не найден", 404);
});
const mutate = withApiHandler(async (request: Request, context: Context) => {
  const auth = await requireKhlUser(request);
  if (auth.response) return auth.response;
  const { path } = await context.params;
  const body = await readKhlBody(request);
  const contestId = requiredStringParam(body.contestId, "contestId");
  const contest = await prisma.khlContest.findUnique({ where: { id: contestId } });
  if (!contest) throw apiError("NOT_FOUND", "Турнир не найден", 404);
  if (path[0] === "preferences" && request.method === "PUT") {
    if (body.schemaVersion !== 1 || !body.preferences || typeof body.preferences !== "object" || Array.isArray(body.preferences)) throw apiError("INVALID_INPUT", "Неверные настройки", 400);
    const p = body.preferences as Record<string, unknown>;
    if (Object.keys(p).some(k => !["position", "club", "query", "maximum", "direction", "compare", "sortField", "minimumToi"].includes(k)) || (p.position !== undefined && !["ALL", "G", "D", "F"].includes(String(p.position))) || ["club", "query", "maximum", "minimumToi"].some(k => p[k] !== undefined && (typeof p[k] !== "string" || String(p[k]).length > 128)) || p.sortField !== undefined && !["price", "ep", "officialFp", "toiSeconds", "ppToiSeconds", "pkToiSeconds", "attackZoneSeconds", "ixg", "saves", "goalsAgainst", "goals", "assists", "shotsOnGoal", "pimMinutes", "plusMinus"].includes(String(p.sortField)) || p.direction !== undefined && p.direction !== 1 && p.direction !== -1 || p.compare !== undefined && (!Array.isArray(p.compare) || p.compare.length > 4 || p.compare.some(id => typeof id !== "string" || id.length > 128))) throw apiError("INVALID_INPUT", "Неверные поля настроек", 400);
    return response(envelope(contest, await prisma.khlUserViewPreference.upsert({ where: { userId_contestId_viewKey: { userId: auth.user.id, contestId, viewKey: "planner" } }, create: { userId: auth.user.id, contestId, viewKey: "planner", schemaVersion: 1, preferences: p as Prisma.InputJsonValue }, update: { schemaVersion: 1, preferences: p as Prisma.InputJsonValue } })));
  }
  if (path[0] === "optimize" && request.method === "POST") return response(envelope(contest, await prepareOptimization(prisma, auth.user.id, contestId, body)));
  if (path[0] === "compare" && request.method === "POST") {
    if (!Array.isArray(body.ids) || body.ids.length < 2 || body.ids.length > 4 || body.ids.some(id => typeof id !== "string") || new Set(body.ids).size !== body.ids.length) throw apiError("INVALID_INPUT", "Нужны 2–4 разных игрока", 400);
    const players = await prisma.khlFantasyPlayer.findMany({ where: { contestId, id: { in: body.ids as string[] } } });
    if (players.length !== body.ids.length) throw apiError("NOT_FOUND", "Игрок не найден в турнире", 404);
    return response(envelope(contest, await hydratePlayers(prisma, players, { weekId: typeof body.weekId === "string" ? body.weekId : undefined })));
  }
  if (path[0] !== "squads") throw apiError("NOT_FOUND", "Маршрут не найден", 404);
  if (path.length === 2 && path[1] === "import-sports-ru" && request.method === "POST") {
    try { return response(envelope(contest, await importSportsHockeySquad(prisma, auth.user.id, contestId, body))); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) throw apiError("VERSION_CONFLICT", "Состав изменился. Повторите импорт", 409); throw error; }
  }
  const squadId = path[1];
  if (squadId) {
    const owned = await prisma.khlUserSquad.findFirst({ where: { id: squadId, userId: auth.user.id, contestId } });
    if (!owned) throw apiError("NOT_FOUND", "Состав не найден", 404);
  }
  if (path.length > 2) {
    if (request.method !== "POST") throw apiError("INVALID_INPUT", "Требуется POST", 405);
    try {
      if (path[2] === "transfer-preview") return response(envelope(contest, await createTransferPreview(prisma, auth.user.id, squadId, contestId, body)));
      if (path[2] === "transfer-plans") return response(envelope(contest, await saveTransferPlan(prisma, auth.user.id, squadId, contestId, body, request.headers.get("idempotency-key"))));
      if (path[2] === "import-sports-ru") return response(envelope(contest, await importOwnedProviderSnapshot(prisma, auth.user.id, contestId, squadId, body.expectedVersion)));
      throw apiError("NOT_FOUND", "Маршрут не найден", 404);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) throw apiError("VERSION_CONFLICT", "Конкурентное изменение, повторите запрос", 409);
      throw error;
    }
  }
  if ((squadId && request.method !== "PUT") || (!squadId && request.method !== "POST")) throw apiError("INVALID_INPUT", "Неверный метод", 405);
  if (!Array.isArray(body.entries) || body.entries.length > 17) throw apiError("INVALID_INPUT", "Максимум 17 игроков", 400);
  const entries = body.entries.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("id" in entry) || !("keepForOptimizer" in entry) || typeof entry.keepForOptimizer !== "boolean") throw apiError("INVALID_INPUT", "Неверный игрок", 400);
    return { id: requiredStringParam(entry.id, "id"), keepForOptimizer: entry.keepForOptimizer };
  });
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw apiError("INVALID_INPUT", "Дубликат игрока", 400);
  if (body.bankUnits !== null && (typeof body.bankUnits !== "number" || !Number.isSafeInteger(body.bankUnits) || body.bankUnits < 0)) throw apiError("INVALID_INPUT", "Неверный банк", 400);
  const bankUnits = body.bankUnits as number | null;
  const name = requiredStringParam(body.name, "name").trim();
  if (body.mode !== "DRAFT" && body.mode !== "COMPLETE") throw apiError("INVALID_INPUT", "Неверный режим", 400);
  if (squadId && (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 1)) throw apiError("INVALID_INPUT", "Требуется версия", 400);
  try {
    const saved = await prisma.$transaction(async tx => {
      const players = await tx.khlFantasyPlayer.findMany({ where: { contestId, id: { in: entries.map(e => e.id) } } });
      if (players.length !== entries.length) throw apiError("NOT_FOUND", "Игрок не найден в турнире", 404);
      const existing = squadId ? await tx.khlUserSquad.findFirstOrThrow({ where: { id: squadId, userId: auth.user.id, contestId }, include: { baseline: true, entries: true } }) : null;
      const baselineIds = existing?.baseline && existing.baseline.userId === auth.user.id && existing.baseline.contestId === contestId ? existing.baseline.entries as string[] : null;
      const baselinePlayers = baselineIds ? await tx.khlFantasyPlayer.findMany({ where: { contestId, id: { in: baselineIds } } }) : [];
      const capital = baselineIds && baselinePlayers.length === 17 && baselinePlayers.every(p => p.currentPriceUnits !== null) ? existing!.baseline!.bankUnits + baselinePlayers.reduce((n, p) => n + p.currentPriceUnits!, 0) : 20000;
      const violations = validateRoster(players.map(playerDto), capital, body.mode === "COMPLETE");
      if (body.mode === "DRAFT" && violations.some(code => code.startsWith("POSITION_") || code === "ROSTER_SIZE" || code === "DUPLICATE_PLAYER" || code === "CONTEST_MISMATCH")) throw apiError("INVALID_ROSTER", "Превышено число мест позиции", 422);
      if (body.mode === "COMPLETE" && (violations.length || bankUnits === null || players.some(p => p.currentPriceUnits === null) || players.reduce((n, p) => n + (p.currentPriceUnits ?? 0), 0) + bankUnits !== capital)) throw apiError("INVALID_ROSTER", violations.join(", ") || "Проверьте банк и бюджет", 422);
      if (squadId) {
        const manuallyChanged = bankUnits !== existing!.bankUnits || entries.length !== existing!.entries.length || entries.some(e => !existing!.entries.some(old => old.fantasyPlayerId === e.id));
        const result = await tx.khlUserSquad.updateMany({ where: { id: squadId, userId: auth.user.id, contestId, revision: Number(body.expectedVersion) }, data: { name, bankUnits, ...(manuallyChanged ? { baselineSnapshotId: null, kind: "LOCAL_DRAFT" } : {}), revision: { increment: 1 } } });
        if (result.count !== 1) throw apiError("VERSION_CONFLICT", "Состав изменён в другой вкладке", 409);
        await tx.khlUserSquadEntry.deleteMany({ where: { squadId } });
      }
      const squad = squadId ? await tx.khlUserSquad.findUniqueOrThrow({ where: { id: squadId } }) : await tx.khlUserSquad.create({ data: { userId: auth.user.id, contestId, name, bankUnits } });
      await tx.khlUserSquadEntry.createMany({ data: entries.map((e, slotIndex) => ({ squadId: squad.id, contestId, fantasyPlayerId: e.id, keepForOptimizer: e.keepForOptimizer, slotIndex })) });
      return { ...squad, entries, violations, externalExecuted: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return response(envelope(contest, saved));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) throw apiError("VERSION_CONFLICT", "Конфликт версии или имени состава", 409);
    throw error;
  }
});
export const POST = mutate;
export const PUT = mutate;
