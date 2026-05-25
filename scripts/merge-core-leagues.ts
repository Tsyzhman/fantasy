import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

type TargetLeague = {
  id: bigint;
  name: string;
  country: string | null;
};

type LeagueCandidate = {
  id: bigint;
  name: string;
  country: string | null;
  rawRef: string | null;
  seasons: Array<{ season: string }>;
  _count: {
    matches: number;
    seasons: number;
    fantasyPrices: number;
    fantasySquads: number;
    fantasyContests: number;
  };
};

type Matcher = {
  words?: string[];
  anyPhrase?: string[];
  compactIncludes?: string[];
  country?: Array<string | null>;
  exclude?: string[];
};

type MergeRule = {
  target: TargetLeague;
  matchers: Matcher[];
};

type PlannedMerge = {
  source: LeagueCandidate;
  target: TargetLeague;
  ruleName: string;
};

type MergeCounts = Record<string, number>;

const rules: MergeRule[] = [
  rule(42, "Champions League", "International", [
    {
      words: ["champions", "league"],
      country: ["international", null],
      exclude: ["afc", "caf", "concacaf", "ofc", "women", "youth", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(10216, "Conference League", "International", [
    {
      words: ["conference", "league"],
      country: ["international", null],
      exclude: ["women", "youth", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(73, "Europa League", "International", [
    {
      words: ["europa", "league"],
      country: ["international", null],
      exclude: ["conference", "women", "youth", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(50, "EURO", "International", [
    {
      words: ["euro"],
      country: ["international", null],
      exclude: ["qualification", "qualifier", "qualifying", "women", "futsal", "beach", "u17", "u19", "u20", "u21"]
    },
    {
      words: ["european", "championship"],
      country: ["international", null],
      exclude: ["qualification", "qualifier", "qualifying", "women", "futsal", "beach", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(48, "Championship", "England", [
    {
      words: ["championship"],
      anyPhrase: ["playoff", "play off", "playoffs", "play offs"],
      country: ["england", null],
      exclude: ["scottish", "usl", "women", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(133, "EFL Cup", "England", [
    {
      words: ["efl", "cup"],
      anyPhrase: ["qualification", "qualifying", "qualifier"],
      country: ["england", null],
      exclude: ["women", "u17", "u19", "u20", "u21"]
    },
    {
      words: ["carabao", "cup"],
      anyPhrase: ["qualification", "qualifying", "qualifier"],
      country: ["england", null],
      exclude: ["women", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(140, "LaLiga2", "Spain", [
    {
      anyPhrase: ["laliga2 playoff", "laliga 2 playoff", "la liga 2 playoff", "laliga2 play off", "laliga 2 play off", "la liga 2 play off"],
      compactIncludes: ["laliga2playoff", "laliga2playoffs"],
      country: ["spain", null],
      exclude: ["women", "u17", "u19", "u20", "u21"]
    }
  ]),
  rule(108, "League One", "England", [
    {
      anyPhrase: ["league one", "efl league one", "league one playoff", "league one play off"],
      country: ["england", null],
      exclude: ["usl", "scottish", "women", "u17", "u19", "u20", "u21"]
    }
  ])
];

const cli = parseCli(process.argv.slice(2));

void main();

async function main() {
  loadDotEnv();
  const prisma = new PrismaClient();

  try {
    const plan = await buildPlan(prisma);
    printPlan(plan);

    if (plan.length === 0) return;
    if (!cli.apply) {
      console.info("\nDry run only. Re-run with --apply to write these changes.");
      return;
    }

    const counts = await prisma.$transaction(async (tx) => {
      const totals: MergeCounts = {};
      for (const item of plan) {
        const result = await mergeLeague(tx, item);
        addCounts(totals, result);
      }
      await tx.$executeRaw`DELETE FROM shotmap_comparisons_cache`;
      return totals;
    }, { timeout: 120_000 });

    console.info("\nApplied merge.");
    printCounts(counts);
  } finally {
    await prisma.$disconnect();
  }
}

async function buildPlan(prisma: PrismaClient): Promise<PlannedMerge[]> {
  const leagues = await prisma.coreLeague.findMany({
    select: {
      id: true,
      name: true,
      country: true,
      rawRef: true,
      seasons: {
        select: { season: true },
        ...(cli.seasons.length > 0 ? { where: { season: { in: cli.seasons } } } : {}),
        orderBy: { season: "asc" }
      },
      _count: {
        select: {
          matches: true,
          seasons: true,
          fantasyPrices: true,
          fantasySquads: true,
          fantasyContests: true
        }
      }
    },
    orderBy: [{ country: "asc" }, { name: "asc" }]
  });

  const planned: PlannedMerge[] = [];
  const seenSources = new Set<string>();

  for (const league of leagues) {
    if (cli.seasons.length > 0 && league.seasons.length === 0) continue;

    for (const mergeRule of rules) {
      if (league.id === mergeRule.target.id) continue;
      if (!matchesRule(league, mergeRule)) continue;

      const key = String(league.id);
      if (seenSources.has(key)) continue;
      seenSources.add(key);
      planned.push({
        source: league,
        target: mergeRule.target,
        ruleName: mergeRule.target.name
      });
      break;
    }
  }

  return planned.sort((left, right) => Number(left.target.id - right.target.id) || left.source.name.localeCompare(right.source.name));
}

function matchesRule(league: Pick<LeagueCandidate, "name" | "country">, mergeRule: MergeRule) {
  return mergeRule.matchers.some((matcher) => matchesMatcher(league, matcher));
}

function matchesMatcher(league: Pick<LeagueCandidate, "name" | "country">, matcher: Matcher) {
  const text = normalizeText(league.name);
  const compact = text.replace(/\s+/g, "");
  const country = normalizeCountry(league.country);

  if (matcher.country && !matcher.country.some((candidate) => normalizeCountry(candidate) === country)) return false;
  if (matcher.exclude?.some((word) => hasWord(text, word))) return false;
  if (matcher.words?.some((word) => !hasWord(text, word))) return false;
  if (matcher.anyPhrase && !matcher.anyPhrase.some((phrase) => text.includes(normalizeText(phrase)))) return false;
  if (matcher.compactIncludes && !matcher.compactIncludes.some((phrase) => compact.includes(normalizeText(phrase).replace(/\s+/g, "")))) return false;

  return true;
}

async function mergeLeague(tx: Prisma.TransactionClient, item: PlannedMerge): Promise<MergeCounts> {
  const sourceId = item.source.id;
  const targetId = item.target.id;
  const targetName = item.target.name;
  const targetCountry = item.target.country;
  const seasonFilter = cli.seasons.length > 0 ? Prisma.sql`AND season IN (${Prisma.join(cli.seasons)})` : Prisma.empty;

  await tx.coreLeague.upsert({
    where: { id: targetId },
    create: {
      id: targetId,
      name: targetName,
      country: targetCountry,
      source: "fotmob",
      rawRef: String(targetId)
    },
    update: {
      rawRef: String(targetId)
    }
  });

  const counts: MergeCounts = {};

  counts.leagueSeasons = await tx.$executeRaw`
    INSERT INTO league_seasons (
      league_id, season, source, calendar_type, is_current, provider_season,
      name, country, metadata, created_at, updated_at
    )
    SELECT
      ${targetId}, season, source, calendar_type, is_current, provider_season,
      name, country, metadata, created_at, now()
    FROM league_seasons
    WHERE league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (league_id, season) DO UPDATE SET
      source = COALESCE(league_seasons.source, EXCLUDED.source),
      calendar_type = COALESCE(league_seasons.calendar_type, EXCLUDED.calendar_type),
      is_current = league_seasons.is_current OR EXCLUDED.is_current,
      provider_season = COALESCE(league_seasons.provider_season, EXCLUDED.provider_season),
      name = COALESCE(league_seasons.name, EXCLUDED.name),
      country = COALESCE(league_seasons.country, EXCLUDED.country),
      metadata = COALESCE(league_seasons.metadata, EXCLUDED.metadata),
      updated_at = now()
  `;

  counts.leagueSeasonTeams = await tx.$executeRaw`
    INSERT INTO league_season_teams (
      league_id, season, team_id, source, active, first_seen_at, last_seen_at,
      metadata, created_at, updated_at
    )
    SELECT
      ${targetId}, season, team_id, source, active, first_seen_at, last_seen_at,
      metadata, created_at, now()
    FROM league_season_teams
    WHERE league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (league_id, season, team_id) DO UPDATE SET
      source = COALESCE(league_season_teams.source, EXCLUDED.source),
      active = league_season_teams.active OR EXCLUDED.active,
      first_seen_at = LEAST(league_season_teams.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(league_season_teams.last_seen_at, EXCLUDED.last_seen_at),
      metadata = COALESCE(league_season_teams.metadata, EXCLUDED.metadata),
      updated_at = now()
  `;

  counts.teamPlayerSeasons = await tx.$executeRaw`
    INSERT INTO team_player_seasons (
      league_id, season, team_id, player_id, source, active, is_starter,
      position, shirt_number, nationality, age, photo_url, first_seen_at,
      last_seen_at, roster_payload, created_at, updated_at
    )
    SELECT
      ${targetId}, season, team_id, player_id, source, active, is_starter,
      position, shirt_number, nationality, age, photo_url, first_seen_at,
      last_seen_at, roster_payload, created_at, now()
    FROM team_player_seasons
    WHERE league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (league_id, season, team_id, player_id) DO UPDATE SET
      source = COALESCE(team_player_seasons.source, EXCLUDED.source),
      active = team_player_seasons.active OR EXCLUDED.active,
      is_starter = team_player_seasons.is_starter OR EXCLUDED.is_starter,
      position = COALESCE(team_player_seasons.position, EXCLUDED.position),
      shirt_number = COALESCE(team_player_seasons.shirt_number, EXCLUDED.shirt_number),
      nationality = COALESCE(team_player_seasons.nationality, EXCLUDED.nationality),
      age = COALESCE(team_player_seasons.age, EXCLUDED.age),
      photo_url = COALESCE(team_player_seasons.photo_url, EXCLUDED.photo_url),
      first_seen_at = LEAST(team_player_seasons.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(team_player_seasons.last_seen_at, EXCLUDED.last_seen_at),
      roster_payload = COALESCE(team_player_seasons.roster_payload, EXCLUDED.roster_payload),
      updated_at = now()
  `;

  counts.matches = await tx.$executeRaw`
    UPDATE matches
    SET league_id = ${targetId}, updated_at = now()
    WHERE league_id = ${sourceId}
    ${seasonFilter}
  `;

  counts.fantasyPrices = await tx.$executeRaw`
    INSERT INTO fantasy_player_prices (
      id, league_id, season, team_id, player_id, provider, provider_player_id,
      player_name, normalized_name, team_name, position, price, raw,
      first_seen_at, last_seen_at
    )
    SELECT
      'merge_' || md5(id || ':' || ${targetId}::text), ${targetId}, season, team_id, player_id,
      provider, provider_player_id, player_name, normalized_name, team_name,
      position, price, raw, first_seen_at, last_seen_at
    FROM fantasy_player_prices
    WHERE league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (provider, league_id, season, normalized_name, team_name) DO UPDATE SET
      team_id = COALESCE(fantasy_player_prices.team_id, EXCLUDED.team_id),
      player_id = COALESCE(fantasy_player_prices.player_id, EXCLUDED.player_id),
      provider_player_id = COALESCE(fantasy_player_prices.provider_player_id, EXCLUDED.provider_player_id),
      position = COALESCE(fantasy_player_prices.position, EXCLUDED.position),
      price = CASE
        WHEN EXCLUDED.last_seen_at >= fantasy_player_prices.last_seen_at THEN EXCLUDED.price
        ELSE fantasy_player_prices.price
      END,
      raw = COALESCE(fantasy_player_prices.raw, EXCLUDED.raw),
      first_seen_at = LEAST(fantasy_player_prices.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(fantasy_player_prices.last_seen_at, EXCLUDED.last_seen_at)
  `;

  counts.fantasyContests = await tx.$executeRaw`
    INSERT INTO sports_ru_fantasy_contests (
      id, league_id, season, provider, provider_contest_id, slug, name,
      budget_limit, squad_size, max_players_per_team, rules, source_url,
      last_synced_at, created_at, updated_at
    )
    SELECT
      'merge_' || md5(id || ':' || ${targetId}::text), ${targetId}, season, provider,
      provider_contest_id, slug, name, budget_limit, squad_size, max_players_per_team,
      rules, source_url, last_synced_at, created_at, now()
    FROM sports_ru_fantasy_contests
    WHERE league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (provider, league_id, season) DO UPDATE SET
      provider_contest_id = COALESCE(sports_ru_fantasy_contests.provider_contest_id, EXCLUDED.provider_contest_id),
      slug = COALESCE(sports_ru_fantasy_contests.slug, EXCLUDED.slug),
      rules = COALESCE(sports_ru_fantasy_contests.rules, EXCLUDED.rules),
      source_url = COALESCE(sports_ru_fantasy_contests.source_url, EXCLUDED.source_url),
      last_synced_at = GREATEST(sports_ru_fantasy_contests.last_synced_at, EXCLUDED.last_synced_at),
      updated_at = now()
  `;

  await mergeFantasySquads(tx, sourceId, targetId, seasonFilter);

  counts.sourceFantasyPricesDeleted = await tx.$executeRaw`
    DELETE FROM fantasy_player_prices
    WHERE league_id = ${sourceId}
    ${seasonFilter}
  `;

  counts.sourceFantasyContestsDeleted = await tx.$executeRaw`
    DELETE FROM sports_ru_fantasy_contests
    WHERE league_id = ${sourceId}
    ${seasonFilter}
  `;

  counts.sourceTeamPlayersDeleted = await tx.$executeRaw`
    DELETE FROM team_player_seasons
    WHERE league_id = ${sourceId}
    ${seasonFilter}
  `;

  counts.sourceSeasonTeamsDeleted = await tx.$executeRaw`
    DELETE FROM league_season_teams
    WHERE league_id = ${sourceId}
    ${seasonFilter}
  `;

  counts.sourceSeasonsDeleted = await tx.$executeRaw`
    DELETE FROM league_seasons
    WHERE league_id = ${sourceId}
    ${seasonFilter}
  `;

  counts.ingestionRuns = await tx.$executeRaw`
    UPDATE ingestion_runs
    SET league_id = ${targetId}
    WHERE league_id = ${sourceId}
    ${seasonFilter}
  `;

  counts.ingestionJobsCurrent = await tx.$executeRaw`
    UPDATE ingestion_jobs
    SET current_league_id = ${targetId}, updated_at = now()
    WHERE current_league_id = ${sourceId}
  `;

  counts.ingestionCheckpoints = await tx.$executeRaw`
    INSERT INTO ingestion_checkpoints (
      source, job_type, league_id, season, last_processed_match_id,
      last_processed_date, cursor, updated_at
    )
    SELECT
      source, job_type, ${targetId}, season, last_processed_match_id,
      last_processed_date, cursor, updated_at
    FROM ingestion_checkpoints
    WHERE league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (source, job_type, league_id, season) DO UPDATE SET
      last_processed_match_id = COALESCE(ingestion_checkpoints.last_processed_match_id, EXCLUDED.last_processed_match_id),
      last_processed_date = GREATEST(ingestion_checkpoints.last_processed_date, EXCLUDED.last_processed_date),
      cursor = COALESCE(ingestion_checkpoints.cursor, EXCLUDED.cursor),
      updated_at = now()
  `;

  counts.sourceIngestionCheckpointsDeleted = await tx.$executeRaw`
    DELETE FROM ingestion_checkpoints
    WHERE league_id = ${sourceId}
    ${seasonFilter}
  `;

  if (cli.deleteSourceLeagues && cli.seasons.length === 0) {
    counts.sourceLeaguesDeleted = await tx.$executeRaw`
      DELETE FROM leagues
      WHERE id = ${sourceId}
    `;
  }

  return counts;
}

async function mergeFantasySquads(tx: Prisma.TransactionClient, sourceId: bigint, targetId: bigint, seasonFilter: Prisma.Sql) {
  const sourceSquadSeasonFilter = cli.seasons.length > 0 ? Prisma.sql`AND source_squad.season IN (${Prisma.join(cli.seasons)})` : Prisma.empty;

  await tx.$executeRaw`
    INSERT INTO user_fantasy_squads (
      id, user_id, league_id, season, name, budget_limit, bank,
      horizon_rounds, filters, created_at, updated_at
    )
    SELECT
      'merge_' || md5(id || ':' || ${targetId}::text), user_id, ${targetId}, season,
      name, budget_limit, bank, horizon_rounds, filters, created_at, now()
    FROM user_fantasy_squads
    WHERE league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (user_id, league_id, season) DO UPDATE SET
      budget_limit = user_fantasy_squads.budget_limit,
      bank = user_fantasy_squads.bank,
      horizon_rounds = user_fantasy_squads.horizon_rounds,
      filters = COALESCE(user_fantasy_squads.filters, EXCLUDED.filters),
      updated_at = now()
  `;

  await tx.$executeRaw`
    INSERT INTO user_fantasy_squad_players (
      id, squad_id, player_id, team_id, position, is_starter, is_locked,
      is_captain, is_vice_captain, slot_index, purchase_price, added_at
    )
    SELECT
      'merge_' || md5(player.id || ':' || target_squad.id),
      target_squad.id,
      player.player_id,
      player.team_id,
      player.position,
      player.is_starter,
      player.is_locked,
      player.is_captain,
      player.is_vice_captain,
      player.slot_index,
      player.purchase_price,
      player.added_at
    FROM user_fantasy_squad_players player
    JOIN user_fantasy_squads source_squad ON source_squad.id = player.squad_id
    JOIN user_fantasy_squads target_squad
      ON target_squad.user_id = source_squad.user_id
      AND target_squad.league_id = ${targetId}
      AND target_squad.season = source_squad.season
    WHERE source_squad.league_id = ${sourceId}
    ${sourceSquadSeasonFilter}
    ON CONFLICT (squad_id, player_id) DO UPDATE SET
      is_starter = user_fantasy_squad_players.is_starter OR EXCLUDED.is_starter,
      is_locked = user_fantasy_squad_players.is_locked OR EXCLUDED.is_locked,
      is_captain = user_fantasy_squad_players.is_captain OR EXCLUDED.is_captain,
      is_vice_captain = user_fantasy_squad_players.is_vice_captain OR EXCLUDED.is_vice_captain,
      purchase_price = COALESCE(user_fantasy_squad_players.purchase_price, EXCLUDED.purchase_price)
  `;

  await tx.$executeRaw`
    DELETE FROM user_fantasy_squads
    WHERE league_id = ${sourceId}
    ${seasonFilter}
  `;
}

function rule(id: number, name: string, country: string | null, matchers: Matcher[]): MergeRule {
  return {
    target: {
      id: BigInt(id),
      name,
      country
    },
    matchers
  };
}

function parseCli(args: string[]) {
  const seasons: string[] = [];
  let apply = false;
  let deleteSourceLeagues = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--delete-source-leagues") {
      deleteSourceLeagues = true;
      continue;
    }
    if (arg === "--season") {
      const value = args[index + 1];
      if (!value) throw new Error("--season requires a value.");
      seasons.push(...value.split(",").map((season) => season.trim()).filter(Boolean));
      index += 1;
      continue;
    }
    if (arg.startsWith("--season=")) {
      seasons.push(...arg.slice("--season=".length).split(",").map((season) => season.trim()).filter(Boolean));
      continue;
    }
    throw new Error(`Unknown argument "${arg}". Use --apply, optional --season 2025/2026, and optional --delete-source-leagues.`);
  }

  return {
    apply,
    deleteSourceLeagues,
    seasons: [...new Set(seasons)]
  };
}

function printPlan(plan: PlannedMerge[]) {
  if (cli.seasons.length > 0) {
    console.info(`Season filter: ${cli.seasons.join(", ")}`);
  }

  if (plan.length === 0) {
    console.info("No merge candidates found.");
    return;
  }

  console.info("Planned league merges:");
  if (!cli.deleteSourceLeagues) {
    console.info("Source league rows will be kept as alias markers for future auto-sync; their seasons and matches will move to canonical leagues.");
  }
  for (const item of plan) {
    const seasons = item.source.seasons.map((row) => row.season).join(", ") || "no selected seasons";
    console.info(
      `- ${item.source.id} ${item.source.name}${item.source.country ? ` (${item.source.country})` : ""} -> ` +
        `${item.target.id} ${item.target.name}; seasons: ${seasons}; ` +
        `matches=${item.source._count.matches}, prices=${item.source._count.fantasyPrices}, squads=${item.source._count.fantasySquads}`
    );
  }
}

function printCounts(counts: MergeCounts) {
  for (const [key, value] of Object.entries(counts).sort()) {
    console.info(`- ${key}: ${value}`);
  }
}

function addCounts(target: MergeCounts, source: MergeCounts) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountry(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function hasWord(text: string, word: string) {
  const normalizedWord = normalizeText(word);
  if (!normalizedWord) return false;
  return new RegExp(`(^|\\s)${escapeRegExp(normalizedWord)}(\\s|$)`).test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
