import { Prisma, type PrismaClient } from "@prisma/client";
import { contentHash } from "@/khl/repositories/revisions";
import { validateRoster } from "@/khl/rules";
import { playerDto } from "./read-model";
import { apiError } from "@/lib/api-handler";

/** Trusted adapter boundary. Never accepts a browser's claimed bank as provider evidence. */
export async function recordProviderSnapshot(db: PrismaClient, input: { userId: string; contestId: string; providerEntryId: string; providerWeekId: string; bankUnits: number; transfersUsed: number | null; entries: string[]; source: string; observedAt: Date }) {
  if (!Number.isSafeInteger(input.bankUnits) || input.bankUnits < 0 || input.transfersUsed !== null && (!Number.isInteger(input.transfersUsed) || input.transfersUsed < 0 || input.transfersUsed > 5) || input.entries.length !== 17 || new Set(input.entries).size !== 17) throw new Error("PROVIDER_SNAPSHOT_INVALID");
  return db.$transaction(async tx => {
    const source = await tx.khlSourceContract.findUnique({ where: { provider: "SPORTS_RU_TEAM" } });
    if (source?.permissionStatus !== "VERIFIED" || !source.verifiedAt) throw new Error("PROVIDER_ADAPTER_UNVERIFIED");
    const rows = await tx.khlFantasyPlayer.findMany({ where: { contestId: input.contestId, id: { in: input.entries } } });
    if (rows.length !== 17 || validateRoster(rows.map(row => playerDto(row)), Number.MAX_SAFE_INTEGER).length) throw new Error("PROVIDER_ROSTER_INVALID");
    const hash = contentHash(input);
    return tx.khlProviderSquadSnapshot.upsert({ where: { userId_contestId_providerEntryId_hash: { userId: input.userId, contestId: input.contestId, providerEntryId: input.providerEntryId, hash } }, create: { ...input, hash }, update: {} });
  });
}

export async function importOwnedProviderSnapshot(db: PrismaClient, userId: string, contestId: string, squadId: string, expectedVersion: unknown) {
  if (!Number.isInteger(expectedVersion)) throw apiError("INVALID_INPUT", "Нужна версия состава", 400);
  return db.$transaction(async tx => {
    const snapshot = await tx.khlProviderSquadSnapshot.findFirst({ where: { userId, contestId, observedAt: { gte: new Date(Date.now() - 60000) } }, orderBy: { observedAt: "desc" } });
    if (!snapshot) throw apiError("IMPORT_UNAVAILABLE", "Нет свежего подтверждённого снимка вашей команды", 503);
    const source = await tx.khlSourceContract.findUnique({ where: { provider: "SPORTS_RU_TEAM" } });
    if (source?.permissionStatus !== "VERIFIED" || source.health !== "HEALTHY") throw apiError("IMPORT_UNAVAILABLE", "Адаптер команды не прошёл проверку", 503);
    const updated = await tx.khlUserSquad.updateMany({ where: { id: squadId, userId, contestId, revision: Number(expectedVersion) }, data: { baselineSnapshotId: snapshot.id, bankUnits: snapshot.bankUnits, kind: "PROVIDER_DRAFT", revision: { increment: 1 } } });
    if (!updated.count) throw apiError("VERSION_CONFLICT", "Состав изменился", 409);
    await tx.khlUserSquadEntry.deleteMany({ where: { squadId } });
    await tx.khlUserSquadEntry.createMany({ data: (snapshot.entries as string[]).map((fantasyPlayerId, slotIndex) => ({ squadId, contestId, fantasyPlayerId, slotIndex })) });
    return { ...await tx.khlUserSquad.findUniqueOrThrow({ where: { id: squadId }, include: { entries: true } }), externalExecuted: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
