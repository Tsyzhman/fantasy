import { ensureDatabaseSchema, prisma } from "@/lib/db";
import { parseSportsRuFantasyTournament, parseSportsRuFantasyTournamentLinks } from "@/lib/providers/sports-ru-fantasy";
import { autoMapSportsRuFantasyPlayers } from "@/machete/sports_ru_player_mapping";

type Args = Record<string, string | boolean>;

async function main() {
  await ensureDatabaseSchema();
  const args = parseArgs(process.argv.slice(2));
  const url = stringArg(args.url) ?? "https://www.sports.ru/fantasy/football/";

  if (!args["league-id"] || !args.season) {
    const html = await fetchText(url);
    const links = parseSportsRuFantasyTournamentLinks(html);
    console.log("Sports.ru fantasy tournaments:");
    for (const link of links) {
      console.log(`- ${link.name}: ${link.href}${link.deadline ? `, deadline ${link.deadline}` : ""}`);
    }
    console.log("");
    console.log("Import example:");
    console.log("  npm exec tsx scripts/import-sports-ru-fantasy.ts -- --league-id 47 --season 2025/26 --url https://www.sports.ru/fantasy/football/england/");
    return;
  }

  const leagueId = BigInt(String(args["league-id"]));
  const season = String(args.season);
  const html = await fetchText(url);
  const parsed = parseSportsRuFantasyTournament(html);
  const leagueSeason = await prisma.leagueSeason.findUnique({
    where: {
      leagueId_season: {
        leagueId,
        season
      }
    },
    include: {
      league: true
    }
  });

  if (!leagueSeason) {
    throw new Error(`League season not found: ${leagueId} ${season}`);
  }

  const maxPlayersPerTeam = numberArg(args["max-per-team"]) ?? parsed.contest.maxPlayersPerTeam ?? inferredMaxPlayersPerTeam(leagueSeason.league.name);
  const contestName = parsed.contest.name === "Фэнтези" ? `Sports.ru ${leagueSeason.league.name}` : parsed.contest.name;
  await prisma.sportsRuFantasyContest.upsert({
    where: {
      provider_leagueId_season: {
        provider: "SPORTS_RU",
        leagueId,
        season
      }
    },
    update: {
      name: contestName,
      budgetLimit: parsed.contest.budgetLimit,
      squadSize: parsed.contest.squadSize,
      maxPlayersPerTeam,
      sourceUrl: url,
      rules: {
        parsedMaxPlayersPerTeam: parsed.contest.maxPlayersPerTeam,
        importedAt: new Date().toISOString()
      },
      lastSyncedAt: new Date()
    },
    create: {
      leagueId,
      season,
      provider: "SPORTS_RU",
      name: contestName,
      budgetLimit: parsed.contest.budgetLimit,
      squadSize: parsed.contest.squadSize,
      maxPlayersPerTeam,
      sourceUrl: url,
      rules: {
        parsedMaxPlayersPerTeam: parsed.contest.maxPlayersPerTeam,
        importedAt: new Date().toISOString()
      },
      lastSyncedAt: new Date()
    }
  });

  for (const row of parsed.prices) {
    await prisma.fantasyPlayerPrice.upsert({
      where: {
        provider_leagueId_season_normalizedName_teamName: {
          provider: "SPORTS_RU",
          leagueId,
          season,
          normalizedName: row.normalizedName,
          teamName: ""
        }
      },
      update: {
        playerName: row.playerName,
        position: row.position,
        price: row.price,
        sourceKind: row.sourceKind,
        sourceRowIndex: row.sourceRowIndex,
        lastSeenAt: new Date()
      },
      create: {
        leagueId,
        season,
        provider: "SPORTS_RU",
        playerName: row.playerName,
        normalizedName: row.normalizedName,
        teamName: "",
        position: row.position,
        price: row.price,
        sourceKind: row.sourceKind,
        sourceRowIndex: row.sourceRowIndex,
        lastSeenAt: new Date()
      }
    });
  }
  const mapping = await autoMapSportsRuFantasyPlayers(prisma, { leagueId, season });

  console.log(`Imported ${parsed.prices.length} public Sports.ru prices for ${leagueSeason.league.name} ${season}.`);
  console.log(`Mapped ${mapping.matched} automatically, reused ${mapping.manual} manual links, left ${mapping.unmatched} unmatched.`);
  if (parsed.prices.length === 0) {
    console.log("No public price rows were found. Sports.ru may require an authenticated app endpoint for the full player list.");
  }
}

function inferredMaxPlayersPerTeam(leagueName: string) {
  const value = leagueName.toLowerCase();
  return ["premier league", "la liga", "bundesliga", "serie a", "ligue 1"].some((name) => value.includes(name)) ? 3 : 2;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "MacheteFantasyImporter/1.0"
    }
  });
  if (!response.ok) throw new Error(`Sports.ru request failed: ${response.status} ${response.statusText}`);
  return response.text();
}

function parseArgs(argv: string[]): Args {
  const result: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function stringArg(value: string | boolean | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberArg(value: string | boolean | undefined) {
  if (typeof value !== "string") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
