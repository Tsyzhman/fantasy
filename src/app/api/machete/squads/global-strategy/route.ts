/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { readJsonObject } from "@/lib/request-json";
import { strategyRevision, record } from "@/server/global-strategy-providers";
import { evaluateGlobalStrategyPlan } from "@/machete/global-strategy";
import { fetchSportsRuGlobalSquadChoices } from "@/lib/providers/sports-ru-fantasy";
import { loadGlobalStrategyContext, withGlobalStrategyProviderLimit } from "@/server/global-strategy-context";
export const dynamic = "force-dynamic";
export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const squadId = new URL(request.url).searchParams.get("squadId");
  if (!squadId || squadId.length > 128) return jsonError("BAD_REQUEST", "squadId is required.", 400);
  const result = await loadGlobalStrategyContext(prisma, auth.user.id, squadId);
  return result ? NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } }) : jsonError("NOT_FOUND", "Squad not found.", 404);
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
export const PATCH = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const body = await readJsonObject(request);
  if (typeof body.squadId !== "string" || body.squadId.length > 128 || typeof body.providerSquadId !== "string" || !/^\d{1,20}$/.test(body.providerSquadId)) return jsonError("BAD_REQUEST", "Invalid squad selection.", 400);
  const squad = await prisma.userFantasySquad.findFirst({ where: { id: body.squadId, userId: auth.user.id, provider: "SPORTS_RU" }, include: { contest: true } });
  if (!squad) return jsonError("NOT_FOUND", "Squad not found.", 404);
  const profile = await prisma.userExternalProfile.findUnique({ where: { userId_provider: { userId: auth.user.id, provider: "SPORTS_RU" } } });
  const seasonId = record(squad.contest.rules).sportsRuSeasonId;
  if (!profile || typeof seasonId !== "string") return jsonError("CONFLICT", "Profile or provider season is unavailable.", 409);
  const choices = await withGlobalStrategyProviderLimit("SPORTS_RU", () => fetchSportsRuGlobalSquadChoices(profile.providerUserId, seasonId));
  if (!choices.some((choice) => choice.id === body.providerSquadId)) return jsonError("BAD_REQUEST", "Provider squad does not belong to this profile and season.", 400);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM user_fantasy_squads WHERE id = ${squad.id} FOR UPDATE`);
    const current = await tx.userFantasySquad.findFirst({ where: { id: squad.id, userId: auth.user.id } });
    if (!current) throw new Error("Squad changed during binding.");
    await tx.userFantasySquad.update({ where: { id: squad.id }, data: { filters: { ...record(current.filters), globalStrategyBinding: { providerSquadId: body.providerSquadId as string } } as Prisma.InputJsonValue } });
  });
  return NextResponse.json({ bound: true });
});

/** Store a compact client recommendation; server context and ownership are authoritative,
 * client forecast values remain explicitly marked as reported evidence.
 * @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const body = await readJsonObject(request);
  if (typeof body.squadId !== "string" || body.squadId.length > 128) return jsonError("BAD_REQUEST", "squadId is required.", 400);
  const result = await loadGlobalStrategyContext(prisma, auth.user.id, body.squadId);
  if (!result) return jsonError("NOT_FOUND", "Squad not found.", 404);
  const context = result.requestContext;
  if (!context || !["READY", "NEUTRAL"].includes(result.evaluation.status)) return jsonError("CONFLICT", "Strategy context is unavailable.", 409);
  const input = record(body.analysis);
  const revisions = record(input.sourceRevisions);
  const exposure = record(input.roundExposures);
  if (typeof input.inputSignature !== "string" || input.inputSignature.length > 16000) return jsonError("BAD_REQUEST", "Invalid input signature.", 400);
  if (input.contextRevision !== context.context.revision || revisions.ownership !== context.ownershipRevision || revisions.config !== context.config.version || typeof revisions.forecast !== "string" || revisions.forecast.length > 200) return jsonError("CONFLICT", "Strategy revisions changed.", 409);
  const keys = ["baselineExpectedPoints", "candidateExpectedPoints", "strategyScoreDelta"] as const;
  if (keys.some((key) => typeof input[key] !== "number" || !Number.isFinite(input[key]) || Math.abs(input[key] as number) > 100000)) return jsonError("BAD_REQUEST", "Invalid recommendation scores.", 400);
  const baseline = { expectedPoints: input.baselineExpectedPoints as number, strategyScore: 0 };
  const candidate = { expectedPoints: input.candidateExpectedPoints as number, strategyScore: input.strategyScoreDelta as number };
  const comparison = evaluateGlobalStrategyPlan({ baseline, candidate }, result.evaluation, context.config);
  if (!comparison.eligible && !(Math.abs(comparison.expectedPointsLoss) <= 1e-7 && Math.abs(comparison.strategyScoreDelta) <= 1e-7)) return jsonError("BAD_REQUEST", "Recommendation exceeds its strategy budget.", 400);
  const validExposure = (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= 5 && value.every((round) => Array.isArray(round) && round.length === 11
    && new Set(round.map((item) => record(item).playerId)).size === 11
    && round.every((item) => typeof record(item).playerId === "string" && /^\d{1,20}$/.test(record(item).playerId as string) && [1, 2].includes(record(item).multiplier as number))
    && round.filter((item) => record(item).multiplier === 2).length === 1);
  if (!validExposure(exposure.baseline) || !validExposure(exposure.candidate)) return jsonError("BAD_REQUEST", "Invalid round exposures.", 400);
  const cleanExposure = (value: unknown) => (value as unknown[][]).map((round) => round.map((item) => ({ playerId: record(item).playerId as string, multiplier: record(item).multiplier as number })));
  const sourceRevisions = { ownership: context.ownershipRevision, config: context.config.version, forecast: revisions.forecast as string };
  const compact = { verification: "CLIENT_EP_REPORTED", contextRevision: context.context.revision, configVersion: context.config.version, sourceRevisions,
    k: result.evaluation.k, baselineExpectedPoints: baseline.expectedPoints, candidateExpectedPoints: candidate.expectedPoints, comparison, roundExposures: { baseline: cleanExposure(exposure.baseline), candidate: cleanExposure(exposure.candidate) } };
  const inputHash = strategyRevision([compact.contextRevision, revisions, input.inputSignature]);
  const key = { userId: auth.user.id, squadId: body.squadId, decisionRound: context.context.decisionRoundId ?? context.context.standingsRoundId, inputHash, configVersion: context.config.version };
  await prisma.$transaction(async (tx) => {
    await tx.globalStrategyRecommendation.upsert({ where: { userId_squadId_decisionRound_inputHash_configVersion: key }, update: {}, create: { ...key, contestId: context.context.contestId, result: compact as Prisma.InputJsonValue } });
    await tx.globalStrategyRecommendation.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 60 * 86400000) } } });
  });
  return NextResponse.json({ recorded: true }, { headers: { "Cache-Control": "private, no-store" } });
});
