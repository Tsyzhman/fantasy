/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { Prisma, type PrismaClient } from "@prisma/client";
import { evaluateGlobalStrategy, unavailableGlobalStrategy, type GlobalStrategyEvaluation, type GlobalStrategyRequestContext } from "@/machete/global-strategy";
import { globalStrategyConfig } from "@/machete/global-strategy-config";
import { FplProviderError } from "@/lib/providers/fpl";
import { GlobalStrategyCache } from "./global-strategy-cache";
import { GlobalStrategySourceError, loadFplGlobalSource, loadSportsGlobalSource, record, strategyRevision, type StrategySource, type SharedStrategyRead } from "./global-strategy-providers";

const cache = new GlobalStrategyCache();
export const globalStrategyCacheMetrics = () => cache.metrics();
export const withGlobalStrategyProviderLimit = <T>(provider: "FPL" | "SPORTS_RU", loader: () => Promise<T>) => cache.limit(provider, loader);
export type GlobalStrategyResponse = { evaluation: GlobalStrategyEvaluation; requestContext: GlobalStrategyRequestContext | null; squadOptions?: { id: string; label: string }[] };

export async function loadGlobalStrategyContext(prisma: PrismaClient, userId: string, squadId: string, now = new Date()): Promise<GlobalStrategyResponse | null> {
  const squad = await prisma.userFantasySquad.findFirst({ where: { id: squadId, userId }, include: { contest: true } });
  if (!squad) return null;
  const contest = squad.contest;
  const provider = contest.provider === "FPL" ? "FPL" : "SPORTS_RU";
  const contestRules = record(contest.rules);
  const tournamentKey = provider === "FPL" ? "fpl" : typeof contestRules.tournamentHru === "string" ? contestRules.tournamentHru : contest.slug ?? "";
  const config = globalStrategyConfig(provider, tournamentKey);
  const unavailable = (reason: string): GlobalStrategyResponse => ({ evaluation: unavailableGlobalStrategy(config.version, reason), requestContext: null });
  if (contest.provider !== provider || squad.provider !== provider) return unavailable("PROVIDER_MISMATCH");
  const profile = await prisma.userExternalProfile.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!profile) return unavailable("PROFILE_NOT_LINKED");
  const imported = record(record(squad.filters).globalStrategyBinding);
  const providerSquadId = provider === "FPL" ? profile.providerUserId : typeof imported.providerSquadId === "string" ? imported.providerSquadId : null;
  const nextRound = await prisma.fantasyProviderRound.findFirst({ where: { contestId: contest.id, deadlineAt: { gt: now } }, orderBy: { deadlineAt: "asc" }, select: { providerRoundId: true, deadlineAt: true } });
  const ttl = Math.max(1, Math.min(300_000, nextRound?.deadlineAt ? +nextRound.deadlineAt - +now : 300_000));
  const commonKey = JSON.stringify([provider, contest.id, contest.season, contest.scheduleRevision, nextRound?.providerRoundId]);
  const personalKey = JSON.stringify([commonKey, userId, profile.providerUserId, providerSquadId, profile.updatedAt]);
  const binding: import("./global-strategy-providers").StrategyBinding = { provider, contestId: contest.id, tournamentKey, season: contest.season, providerSeasonId: provider === "SPORTS_RU" && typeof contestRules.sportsRuSeasonId === "string" ? contestRules.sportsRuSeasonId : contest.providerContestId ?? "", providerUserId: profile.providerUserId, providerSquadId };
  try {
    const shared: SharedStrategyRead = (key, loader) => cache.common.getOrCreate(`${commonKey}:${key}`, ttl, loader, +now) as ReturnType<typeof loader>;
    const source = await cache.personal.getOrCreate(personalKey, ttl, () => cache.limit(provider, () => provider === "FPL"
      ? loadFplGlobalSource(binding, now, undefined, shared) : loadSportsGlobalSource(binding, now, undefined, shared)), +now) as StrategySource;
    const evaluation = evaluateGlobalStrategy(source.context, config, now);
    if (evaluation.status === "UNAVAILABLE") return { evaluation, requestContext: null };
    // Price freshness and identity belong to this exact provider/contest, never another EPL feed.
    const prices = await prisma.fantasyPlayerPrice.findMany({ where: { contestId: contest.id, provider }, select: { providerPlayerId: true, selectedByPercent: true, lastSeenAt: true } });
    const observed = prices.length ? new Date(Math.min(...prices.map((price) => +price.lastSeenAt))) : null;
    if (!observed || +now - +observed > 15 * 60_000 || +observed > +now) return unavailable("STALE_OWNERSHIP");
    const ownershipByProviderPlayerId: Record<string, number> = {};
    for (const price of prices) {
      if (!price.providerPlayerId || price.selectedByPercent === null || !Number.isFinite(price.selectedByPercent) || price.selectedByPercent < 0 || price.selectedByPercent > 100) return unavailable("INCOMPLETE_OWNERSHIP");
      ownershipByProviderPlayerId[price.providerPlayerId] = price.selectedByPercent;
    }
    const c = source.context;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`global-strategy:${contest.id}`}))`);
      const existing = await tx.globalContestStrategyState.findUnique({ where: { provider_contestId_season: { provider, contestId: contest.id, season: contest.season } } });
      if (existing && +existing.observedAt > Date.parse(c.observedAt) && existing.sourceRevision !== source.sourceRevision) throw new GlobalStrategySourceError("INCOHERENT_STANDINGS");
      const personalKey = { userId, contestId: contest.id, providerSquadId: c.providerSquadId, season: contest.season };
      const existingPersonal = await tx.userGlobalStrategyState.findUnique({ where: { userId_contestId_providerSquadId_season: personalKey } });
      if (existingPersonal && +existingPersonal.observedAt > Date.parse(c.observedAt) && existingPersonal.contextRevision !== c.revision) throw new GlobalStrategySourceError("INCOHERENT_STANDINGS");
      const common = { sourceRevision: source.sourceRevision, calendarRevision: source.calendarRevision, standingsRoundId: c.standingsRoundId,
        fieldSize: c.fieldSize, leaderPoints: c.leaderPoints, totalRounds: c.totalRounds, remainingRounds: c.remainingRounds, observedAt: new Date(c.observedAt), expiresAt: new Date(c.expiresAt) };
      await tx.globalContestStrategyState.upsert({ where: { provider_contestId_season: { provider, contestId: contest.id, season: contest.season } },
        create: { ...common, provider, contestId: contest.id, season: contest.season }, update: existing && +existing.observedAt > Date.parse(c.observedAt) ? {} : common });
      const personal = { provider, sourceRevision: source.sourceRevision, contextRevision: c.revision, rank: c.rank, managerPoints: c.managerPoints,
        history: source.history as Prisma.InputJsonValue, observedAt: new Date(c.observedAt), expiresAt: new Date(c.expiresAt) };
      await tx.userGlobalStrategyState.upsert({ where: { userId_contestId_providerSquadId_season: { userId, contestId: contest.id, providerSquadId: c.providerSquadId, season: contest.season } },
        create: { ...personal, ...personalKey }, update: existingPersonal && +existingPersonal.observedAt > Date.parse(c.observedAt) ? {} : personal });
    });
    return { evaluation, requestContext: { context: c, config, ownershipByProviderPlayerId, ownershipRevision: strategyRevision([provider, contest.id, observed, ownershipByProviderPlayerId]),
      ownershipExpiresAt: new Date(+observed + 15 * 60_000).toISOString(), forecastRevision: contest.scheduleRevision ?? "unspecified" } };
  } catch (error) {
    if (error instanceof GlobalStrategySourceError) return { ...unavailable(error.reason), ...(error.squadOptions ? { squadOptions: error.squadOptions } : {}) };
    if (error instanceof FplProviderError) return unavailable(error.status === 429 ? "PROVIDER_RATE_LIMITED" : error.status === 503 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REQUEST_FAILED");
    // Database failures must remain visible to operational error handling.
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) throw error;
    return unavailable("PROVIDER_REQUEST_FAILED");
  }
}
