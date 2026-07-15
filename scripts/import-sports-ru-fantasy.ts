import { prisma } from "@/lib/db";
import { parseSportsRuFantasyTournamentLinks, sportsRuTournamentHruFromUrl } from "@/lib/providers/sports-ru-fantasy";
import { parseSportsRuFantasyCliArgs, sportsRuFantasyCliBoolean, type SportsRuFantasyCliArgs } from "@/machete/sports_ru_fantasy_cli";
import { syncSportsRuFantasy } from "@/machete/sports_ru_fantasy_sync";

async function main() {
  const args = parseSportsRuFantasyCliArgs(process.argv.slice(2));
  const url = stringArg(args.url) ?? "https://www.sports.ru/fantasy/football/";

  if (!args["league-id"] || !args.season) {
    const html = await fetchText(url);
    const links = parseSportsRuFantasyTournamentLinks(html);
    console.log("Sports.ru fantasy tournaments:");
    for (const link of links) console.log(`- ${link.name}: ${link.href}${link.deadline ? `, deadline ${link.deadline}` : ""}`);
    console.log("");
    console.log("Sync example:");
    console.log(
      "  npm run prices:sync-sports-ru -- --league-id 47 --season 2026/2027 --url https://www.sports.ru/fantasy/football/england/ --dry-run"
    );
    return;
  }

  const leagueId = BigInt(String(args["league-id"]));
  const season = String(args.season);
  const tournamentHru = stringArg(args.hru) ?? sportsRuTournamentHruFromUrl(url);
  if (!tournamentHru) throw new Error("Sports.ru tournament HRU is required; pass --hru or use a /fantasy/football/<hru>/ URL.");

  const result = await syncSportsRuFantasy(prisma, {
    leagueId,
    season,
    tournamentHru,
    sourceUrl: url,
    minimumPlayers: numberArg(args["minimum-players"]) ?? undefined,
    maxPlayersPerTeam: numberArg(args["max-per-team"]) ?? undefined,
    dryRun: sportsRuFantasyCliBoolean(args["dry-run"])
  });
  if (result.status === "UNAVAILABLE") {
    throw new Error(`Sports.ru has no current fantasy season for ${tournamentHru}; current prices were not imported.`);
  }

  console.log(`Sports.ru current season ${result.seasonId}: ${result.prices} prices for ${tournamentHru}.`);
  if (result.status === "READY") {
    console.log("Dry run: no database rows were changed.");
    return;
  }
  console.log(`Removed ${result.deletedStalePrices} stale price row(s).`);
  console.log(
    `Mapped ${result.mapping?.matched ?? 0} automatically, reused ${result.mapping?.manual ?? 0} manual links, left ${result.mapping?.unmatched ?? 0} unmatched.`
  );
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "user-agent": "MacheteFantasyImporter/2.0" } });
  if (!response.ok) throw new Error(`Sports.ru request failed: ${response.status} ${response.statusText}`);
  return response.text();
}

function stringArg(value: SportsRuFantasyCliArgs[string]) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberArg(value: SportsRuFantasyCliArgs[string]) {
  if (typeof value !== "string") return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) throw new Error(`Expected a positive integer; received ${value}.`);
  return numeric;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
