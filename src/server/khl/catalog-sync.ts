/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations */
import type { PrismaClient } from "@prisma/client";
import type { HockeyCatalogRow } from "@/providers/sports-ru-hockey/catalog";
import { appendRevision, contentHash } from "@/khl/repositories/revisions";
import { bindExternalEntity } from "./data-layer";
import { lockValidLease, type KhlLease } from "./lease";
export async function importCatalog(db: PrismaClient, contestId: string, rows: HockeyCatalogRow[], batchId: string, observedAt: Date, complete = false, lease?: KhlLease) {
  if (!rows.length || rows.length > 2000 || new Set(rows.map(p => p.providerPlayerId)).size !== rows.length) throw new Error("INCOMPLETE_CATALOG");
  const tags = rows.flatMap(p => p.providerTagId ? [p.providerTagId] : []);
  if (new Set(tags).size !== tags.length) throw new Error("DUPLICATE_PROVIDER_IDENTITY");
  return db.$transaction(async tx => {
    await lockValidLease(tx, lease);
    await tx.$queryRaw`SELECT id FROM khl_contests WHERE id = ${contestId} FOR UPDATE`;
    const contest = await tx.khlContest.findUniqueOrThrow({ where: { id: contestId } });
    if ((contest.publishedAt && observedAt < contest.publishedAt)
      || (contest.catalogCheckedAt && observedAt < contest.catalogCheckedAt)) throw new Error("STALE_BATCH");
    let changed = 0, observations = 0;
    for (const row of rows) {
      const streamId = `SPORTS_RU:catalog:${contestId}:${row.providerPlayerId}`;
      const revision = await appendRevision(tx, { streamId, transitionKey: batchId, value: { ...row }, observedAt });
      if (revision.replayed) continue;
      observations++;
      changed += Number(revision.changed);
      if (!revision.changed) {
        const reactivated = await tx.khlFantasyPlayer.updateMany({
          where: { contestId, providerPlayerId: row.providerPlayerId, active: false }, data: { active: true, observedAt }
        });
        changed += reactivated.count;
        continue;
      }
      const externalId = row.providerTagId ?? row.providerPlayerId;
      const scope = row.providerTagId ? "global" : contestId;
      const mapping = await tx.khlExternalEntityMap.findUnique({ where: { provider_entityType_providerScope_externalId: { provider: "SPORTS_RU", entityType: "player", providerScope: scope, externalId } } });
      const playerId = mapping?.playerId ?? (await tx.khlPlayer.create({ data: { name: row.name } })).id;
      await bindExternalEntity(tx, { provider: "SPORTS_RU", entityType: "player", providerScope: scope, externalId, canonicalId: playerId, evidence: `catalog:${batchId}`, verifiedAt: observedAt });
      await tx.khlFantasyPlayer.upsert({ where: { contestId_providerPlayerId: { contestId, providerPlayerId: row.providerPlayerId } }, create: { contestId, ...row, playerId, active: true, observedAt, priceRevision: revision.sequence }, update: { ...row, playerId, active: true, observedAt, priceRevision: revision.sequence } });
    }
    if (complete && observations) {
      const retired = await tx.khlFantasyPlayer.updateMany({ where: { contestId, active: true, providerPlayerId: { notIn: rows.map(p => p.providerPlayerId) } }, data: { active: false } });
      changed += retired.count;
    }
    if (observations) await tx.khlContest.update({ where: { id: contestId }, data: {
      catalogComplete: complete || contest.catalogComplete, revision: { increment: changed ? 1 : 0 },
      ...(changed ? { publishedAt: observedAt } : {}),
      catalogCheckedAt: observedAt,
      catalogHash: contentHash([...rows].sort((a, b) => a.providerPlayerId.localeCompare(b.providerPlayerId)))
    } });
    return { changed, unchanged: rows.length - changed, fingerprint: contentHash(rows) };
  }, { timeout: 30000 });
}
