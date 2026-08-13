import { prisma } from "@/lib/db";
import { FPL_LEAGUE_ID, FPL_SEASON } from "@/lib/providers/fpl";
import { syncFplPrices } from "@/server/fpl-price-sync";
import { syncSportsRuFantasy } from "@/machete/sports_ru_fantasy_sync";

const SPORTS_RU_EPL_SOURCE_URL = "https://www.sports.ru/fantasy/football/england/";

async function main() {
  const failures: string[] = [];
  let fpl: Record<string, unknown>;
  let sportsRuEpl: Record<string, unknown>;

  try {
    const result = await syncFplPrices(prisma, { trigger: "MANUAL" });
    fpl = {
      provider: "FPL",
      status: result.status,
      contestId: result.contestId,
      leagueId: String(FPL_LEAGUE_ID),
      season: FPL_SEASON,
      prices: result.prices,
      mappedPlayers: result.mappedPlayers,
      mappedTeams: result.mappedTeams,
      unmatchedPlayers: result.unmatchedPlayers,
      unmatchedTeams: result.unmatchedTeams,
      latestPublishedGameweek: result.latestPublishedGameweek,
      latestFinalizedGameweek: result.latestFinalizedGameweek
    };
  } catch (error) {
    failures.push("FPL");
    fpl = { provider: "FPL", status: "FAILED", error: safeError(error) };
  }

  try {
    const result = await syncSportsRuFantasy(prisma, {
      leagueId: FPL_LEAGUE_ID,
      season: FPL_SEASON,
      tournamentHru: "england",
      sourceUrl: SPORTS_RU_EPL_SOURCE_URL
    });
    sportsRuEpl = {
      provider: "SPORTS_RU",
      status: result.status,
      leagueId: String(FPL_LEAGUE_ID),
      season: FPL_SEASON,
      sourceUrl: SPORTS_RU_EPL_SOURCE_URL,
      seasonId: result.seasonId,
      prices: result.prices,
      deletedStalePrices: result.deletedStalePrices,
      matched: result.mapping?.matched ?? null,
      manual: result.mapping?.manual ?? null,
      unmatched: result.mapping?.unmatched ?? null,
      databaseChanged: result.databaseChanged
    };
    if (result.status === "UNAVAILABLE") failures.push("SPORTS_RU");
  } catch (error) {
    failures.push("SPORTS_RU");
    sportsRuEpl = { provider: "SPORTS_RU", status: "FAILED", error: safeError(error) };
  }

  console.log(JSON.stringify({ fpl, sportsRuEpl, failures }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/:\/\/[^\s/@]+(?::[^\s/@]+)?@/g, "://[redacted]@")
    .slice(0, 500);
}

main().finally(async () => {
  await prisma.$disconnect();
});
