import type { PrismaClient } from "@prisma/client";
import { bindExternalEntity } from "./data-layer";
/** Season identity is confirmed from source metadata, never today's month. */
export async function bootstrapKhlContest(db: PrismaClient, input: { seasonKey: string; seasonLabel: string; officialSeasonId: string; mobileStageId: string; providerContestId: string; name: string; evidence: string }) {
  if (Object.values(input).some(v => typeof v !== "string" || !v.trim() || v.length > 2000) || !/^\d+$/.test(input.providerContestId) || !/^\d+$/.test(input.officialSeasonId) || !/^\d+$/.test(input.mobileStageId)) throw new Error("SEASON_METADATA_INVALID");
  return db.$transaction(async tx => {
    const competition = await tx.khlCompetition.upsert({ where: { code: "KHL" }, create: { code: "KHL" }, update: {} });
    const season = await tx.khlSeason.upsert({ where: { competitionId_seasonKey: { competitionId: competition.id, seasonKey: input.seasonKey } }, create: { competitionId: competition.id, seasonKey: input.seasonKey, label: input.seasonLabel }, update: {} });
    const contest = await tx.khlContest.upsert({ where: { provider_providerContestId_seasonId: { provider: "SPORTS_RU", providerContestId: input.providerContestId, seasonId: season.id } }, create: { seasonId: season.id, providerContestId: input.providerContestId, name: input.name }, update: {} });
    for (const [provider, externalId, entityType, canonicalId] of [["KHL", input.officialSeasonId, "season", season.id], ["KHL_MOBILE", input.mobileStageId, "season", season.id], ["SPORTS_RU", input.providerContestId, "contest", contest.id]] as const) await bindExternalEntity(tx, { provider, externalId, entityType, canonicalId, providerScope: entityType === "season" ? "global" : season.id, evidence: input.evidence, verifiedAt: new Date() });
    return contest;
  });
}
