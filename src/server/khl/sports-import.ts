/** @spec spec://modules/khl/FEAT-002-khl-squad#sports-import */
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { apiError } from "@/lib/api-handler";
import { fetchSportsHockeySquad, type SportsHockeySquad } from "@/providers/sports-ru-hockey/squad";
import { contentHash } from "@/khl/repositories/revisions";

async function reserveImport(db: PrismaClient, userId: string) {
  const subject = createHash("sha256").update(userId).digest("hex");
  const now = new Date(), cutoff = new Date(now.getTime() - 60000);
  const reserved = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "AuthRateLimit" (id, action, "subjectHash", "failedCount", "lastFailedAt", "createdAt", "updatedAt")
    VALUES (${`khl-import:${subject}`}, 'KHL_SPORTS_IMPORT', ${subject}, 1, ${now}, ${now}, ${now})
    ON CONFLICT (action, "subjectHash") DO UPDATE SET
      "failedCount" = CASE WHEN "AuthRateLimit"."lastFailedAt" < ${cutoff} THEN 1 ELSE "AuthRateLimit"."failedCount" + 1 END,
      "lastFailedAt" = CASE WHEN "AuthRateLimit"."lastFailedAt" < ${cutoff} THEN ${now} ELSE "AuthRateLimit"."lastFailedAt" END,
      "updatedAt" = ${now}
    WHERE "AuthRateLimit"."lastFailedAt" < ${cutoff} OR "AuthRateLimit"."failedCount" < 2 RETURNING id`;
  if (!reserved.length) throw apiError("RATE_LIMITED", "Можно импортировать состав дважды в минуту. Подождите минуту", 429);
}

/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#api */
export async function importSportsHockeySquad(db: PrismaClient, userId: string, contestId: string, input: { squadId?: unknown; expectedVersion?: unknown }, fetchSquad: (profileId: string, contestId: string) => Promise<SportsHockeySquad> = fetchSportsHockeySquad) {
  const squadId = input.squadId;
  if (squadId !== undefined && (typeof squadId !== "string" || !squadId || squadId.length > 128 || !Number.isInteger(input.expectedVersion))) throw apiError("INVALID_INPUT", "Нужны ID и версия состава", 400);
  const [contest, profile, owned] = await Promise.all([
    db.khlContest.findUnique({ where: { id: contestId } }),
    db.userExternalProfile.findUnique({ where: { userId_provider: { userId, provider: "SPORTS_RU" } } }),
    typeof squadId === "string" ? db.khlUserSquad.findFirst({ where: { id: squadId, userId, contestId } }) : null
  ]);
  if (!contest || squadId && !owned) throw apiError("NOT_FOUND", "Состав или турнир не найден", 404);
  if (owned && owned.revision !== input.expectedVersion) throw apiError("VERSION_CONFLICT", "Состав изменился. Обновите страницу перед импортом", 409);
  if (!profile) throw apiError("SPORTS_PROFILE_REQUIRED", "Привяжите публичный профиль Sports в настройках профиля", 422);
  await reserveImport(db, userId);
  let source: SportsHockeySquad;
  try { source = await fetchSquad(profile.providerUserId, contest.providerContestId); }
  catch (error) { throw apiError("IMPORT_UNAVAILABLE", error instanceof Error ? error.message : "Не удалось загрузить состав Sports", 503); }
  return db.$transaction(async tx => {
    const rows = await tx.khlFantasyPlayer.findMany({ where: { contestId, providerPlayerId: { in: source.players.map(p => p.id) } } });
    const byId = new Map(rows.map(p => [p.providerPlayerId, p]));
    if (rows.length !== 17 || source.players.some(p => byId.get(p.id)?.position !== p.position)) throw apiError("IMPORT_UNMAPPED", "Не все 17 игроков Sports сопоставлены с каталогом КХЛ. Текущий состав сохранён", 422);
    const clubCounts = new Map<string, number>();
    for (const row of rows) clubCounts.set(row.clubId, (clubCounts.get(row.clubId) ?? 0) + 1);
    if ([...clubCounts.values()].some(count => count > 3)) throw apiError("IMPORT_UNMAPPED", "Клубы игроков в каталоге расходятся с правилами Sports. Состав сохранён", 422);
    const profileNow = await tx.userExternalProfile.findUnique({ where: { userId_provider: { userId, provider: "SPORTS_RU" } } });
    if (profileNow?.providerUserId !== profile.providerUserId) throw apiError("VERSION_CONFLICT", "Привязка Sports изменилась. Повторите импорт", 409);
    const now = new Date(), entries = source.players.map(p => byId.get(p.id)!.id);
    const observed = { userId, contestId, providerEntryId: source.teamId, providerWeekId: source.week, bankUnits: source.bank, transfersUsed: null, entries, source: source.source };
    const hash = contentHash(observed);
    const snapshot = await tx.khlProviderSquadSnapshot.upsert({ where: { userId_contestId_providerEntryId_hash: { userId, contestId, providerEntryId: source.teamId, hash } }, create: { ...observed, hash, observedAt: now }, update: { observedAt: now } });
    let id: string;
    if (owned) {
      const update = await tx.khlUserSquad.updateMany({ where: { id: owned.id, userId, contestId, revision: Number(input.expectedVersion) }, data: { baselineSnapshotId: snapshot.id, bankUnits: source.bank, kind: "PROVIDER_DRAFT", revision: { increment: 1 } } });
      if (!update.count) throw apiError("VERSION_CONFLICT", "Состав изменился во время импорта. Ваши изменения сохранены", 409);
      id = owned.id;
      await tx.khlUserSquadEntry.deleteMany({ where: { squadId: id } });
    } else {
      const name = `${source.name} · Sports ${source.teamId}`;
      const previous = await tx.khlUserSquad.findUnique({ where: { userId_contestId_name: { userId, contestId, name } } });
      if (previous) throw apiError("VERSION_CONFLICT", "Этот состав Sports уже импортирован. Откройте его для обновления", 409);
      id = (await tx.khlUserSquad.create({ data: { userId, contestId, name, baselineSnapshotId: snapshot.id, bankUnits: source.bank, kind: "PROVIDER_DRAFT" } })).id;
    }
    await tx.khlUserSquadEntry.createMany({ data: entries.map((fantasyPlayerId, slotIndex) => ({ squadId: id, contestId, fantasyPlayerId, slotIndex })) });
    const contract = { permissionStatus: "VERIFIED", verifiedAt: now, health: "HEALTHY", lastSuccessAt: now, capabilities: ["currentSquad", "bank"], definitionVersion: "sports-hockey-current-v1", evidence: "Public profile/team ownership, contest, 17 provider IDs/positions and published total price verified; GET /fantasy/hockey/team/json/{id}.json", coverage: { currentSquad: true, bank: true, transfersUsed: false, history: false } };
    await tx.khlSourceContract.upsert({ where: { provider: "SPORTS_RU_TEAM" }, create: { provider: "SPORTS_RU_TEAM", ...contract }, update: contract });
    const keep = await tx.khlProviderSquadSnapshot.findMany({ where: { userId, contestId }, orderBy: { observedAt: "desc" }, select: { id: true }, take: 3 });
    await tx.khlProviderSquadSnapshot.deleteMany({ where: { userId, contestId, id: { notIn: keep.map(s => s.id) }, squads: { none: {} } } });
    const squad = await tx.khlUserSquad.findUniqueOrThrow({ where: { id }, include: { entries: { orderBy: { slotIndex: "asc" } } } });
    const capitalUnits = rows.every(p => p.currentPriceUnits !== null) ? source.bank + rows.reduce((sum, p) => sum + p.currentPriceUnits!, 0) : source.totalPrice + source.bank;
    return { squad: { id, contestId, name: squad.name, revision: squad.revision, bankUnits: squad.bankUnits, capitalUnits, entries: squad.entries.map(e => ({ id: e.fantasyPlayerId, keepForOptimizer: e.keepForOptimizer })) }, importedPlayers: entries.length, sourceUrl: source.source, providerWeek: source.week, observedAt: now.toISOString(), externalExecuted: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
}
