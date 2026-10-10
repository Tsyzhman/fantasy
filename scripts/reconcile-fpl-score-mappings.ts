/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reconcileFplScoreMappings } from "@/server/fpl-score-reconciliation";
import { FPL_LEAGUE_ID, FPL_SEASON } from "@/lib/providers/fpl";

async function main() {
  const contest = await prisma.fantasyContest.findUniqueOrThrow({
    where: { provider_leagueId_season: { provider: "FPL", leagueId: FPL_LEAGUE_ID, season: FPL_SEASON } }, select: { id: true }
  });
  const changed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('fantasy-scout:fpl:official-score-sync'))`);
    return reconcileFplScoreMappings(tx, { contestId: contest.id });
  });
  console.info(JSON.stringify({ contestId: contest.id, changed, officialValuesUnchanged: true }));
}
main().finally(() => prisma.$disconnect());
