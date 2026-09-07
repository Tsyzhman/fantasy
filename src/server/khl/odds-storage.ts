import { Prisma, type PrismaClient } from "@prisma/client";
import { appendRevision } from "@/khl/repositories/revisions";
import { hockeyMarketKey, noVig, reconcileMarkets, type HockeyMarket } from "@/providers/fonbet/hockey-markets";
export async function storeHockeyOdds(db: PrismaClient, input: { eventId: string; dictionaryVersion: string; markets: HockeyMarket[]; complete: boolean; success: boolean; batchId: string; observedAt: Date }) {
  if (input.markets.length > 500 || new Set(input.markets.map(hockeyMarketKey)).size !== input.markets.length) throw new Error("ODDS_BATCH_INVALID");
  for (const m of input.markets) if (!["REGULATION_60", "INCLUDING_OT_SO"].includes(m.scope) || !["1X2", "WINNER", "TOTAL"].includes(m.type) || !Number.isInteger(m.period) || m.period < 0 || m.period > 3 || m.odds !== null && (!Number.isFinite(m.odds) || m.odds <= 1) || m.line !== null && !Number.isFinite(m.line)) throw new Error("ODDS_MARKET_INVALID");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM khl_odds_event_maps WHERE id = ${input.eventId} FOR UPDATE`;
    const event = await tx.khlOddsEventMap.findUniqueOrThrow({ where: { id: input.eventId }, include: { match: true } });
    if (event.dictionaryVersion !== input.dictionaryVersion || input.dictionaryVersion === "unverified") throw new Error("HOCKEY_DICTIONARY_UNVERIFIED");
    const previous = await tx.khlOddsSnapshot.findMany({ where: { eventId: event.id }, orderBy: [{ observedAt: "desc" }, { revision: "desc" }], distinct: ["marketKey"], take: 500 });
    const markets = reconcileMarkets(previous.map(s => s.prices as unknown as HockeyMarket), input.markets, input.complete, input.success);
    if (!input.success) return { changed: 0, stale: true };
    let changed = 0;
    for (const market of markets.markets) {
      const marketKey = hockeyMarketKey(market);
      const revision = await appendRevision(tx, { streamId: `odds:${event.id}:${marketKey}`, transitionKey: input.batchId, value: { ...market }, observedAt: input.observedAt });
      if (!revision.changed) continue;
      const family = markets.markets.filter(m => m.type === market.type && m.scope === market.scope && m.period === market.period && m.line === market.line);
      await tx.khlOddsSnapshot.create({ data: { eventId: event.id, marketKey, revision: revision.sequence, status: market.status, prices: { ...market }, probabilities: noVig(family) ?? Prisma.DbNull, observedAt: input.observedAt } });
      changed++;
    }
    if (changed) await tx.khlContest.updateMany({ where: { seasonId: event.match.seasonId }, data: { revision: { increment: 1 } } });
    return { changed, stale: false };
  });
}
