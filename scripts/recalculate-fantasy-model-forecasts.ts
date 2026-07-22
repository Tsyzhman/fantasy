import { PrismaClient } from "@prisma/client";
import { recalculateFantasyModelForecasts } from "@/machete/foontasy_style_forecast_service";

const prisma = new PrismaClient();

async function main() {
  const leagueId = BigInt(process.env.FOONTASY_LEAGUE_ID ?? "63");
  const season = process.env.FOONTASY_SEASON ?? "2026/2027";
  const result = await recalculateFantasyModelForecasts(prisma, { leagueId, season });
  console.log(JSON.stringify(result));
}

main().finally(() => prisma.$disconnect());
