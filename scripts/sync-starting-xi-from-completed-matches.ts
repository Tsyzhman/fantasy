import { PrismaClient } from "@prisma/client";

import { applyStartingXiFromCompletedMatches } from "@/machete/starting-xi-from-match";

const prisma = new PrismaClient();

async function main() {
  if (!process.argv.includes("--apply")) {
    throw new Error("This command changes starter flags. Re-run with --apply after reviewing the selected scopes.");
  }
  const requestedLeagueIds = csvArgument("--league-ids").map((value) => BigInt(value));
  const requestedSeason = stringArgument("--season");
  const scopes = await prisma.leagueSeason.findMany({
    where: {
      isCurrent: true,
      ...(requestedLeagueIds.length > 0 ? { leagueId: { in: requestedLeagueIds } } : {}),
      ...(requestedSeason ? { season: requestedSeason } : {})
    },
    orderBy: [{ leagueId: "asc" }, { season: "asc" }],
    select: { leagueId: true, season: true, league: { select: { name: true } } }
  });
  if (scopes.length === 0) throw new Error("No current league-season scopes matched the command arguments.");

  for (const scope of scopes) {
    const result = await applyStartingXiFromCompletedMatches(prisma, scope);
    console.log(JSON.stringify({
      leagueId: String(scope.leagueId),
      league: scope.league.name,
      season: scope.season,
      ...result
    }));
  }
}

function stringArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

function csvArgument(name: string) {
  return (stringArgument(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
