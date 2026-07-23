import { PrismaClient } from "@prisma/client";

import { analyzeFoontasyArchive } from "@/machete/foontasy_archive_analysis";

const prisma = new PrismaClient();

async function main() {
  const leagueId = BigInt(process.env.FOONTASY_LEAGUE_ID ?? "63");
  const season = process.env.FOONTASY_SEASON ?? "2026/2027";
  const rows = await prisma.foontasyForecastSample.findMany({
    where: { leagueId, season, modelNextPoints: { not: null } },
    select: {
      roundNumber: true,
      position: true,
      foontasyPoints: true,
      modelNextPoints: true
    },
    orderBy: [{ roundNumber: "asc" }, { sourcePlayerId: "asc" }]
  });
  const result = analyzeFoontasyArchive(rows.flatMap((row) => row.modelNextPoints === null ? [] : [{
    roundNumber: row.roundNumber,
    position: row.position,
    foontasyPoints: row.foontasyPoints,
    modelNextPoints: row.modelNextPoints
  }]));
  console.log(JSON.stringify({ leagueId: String(leagueId), season, ...result }, null, 2));
  if (!result.ready) {
    console.error(`Need ${result.minimumRounds} distinct rounds; archive currently contains ${result.rounds.length}.`);
  }
}

main().finally(() => prisma.$disconnect());
