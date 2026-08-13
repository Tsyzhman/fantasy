import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { canonicalLeagueIdForIdentity, targetLeagueForCanonicalId } from "../src/core_data/league-aliases";

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

type PlannedMerge = {
  source: LeagueCandidate;
  target: TargetLeague;
  ruleName: string;
};

type MergeCounts = Record<string, number>;

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

    const canonicalLeagueId = canonicalLeagueIdForIdentity({
      id: league.id,
      name: league.name,
      country: league.country
    });
    if (!canonicalLeagueId || BigInt(canonicalLeagueId) === league.id) continue;

    const target = targetLeagueForCanonicalId(canonicalLeagueId);
    if (!target) continue;

    const key = String(league.id);
    if (seenSources.has(key)) continue;
    seenSources.add(key);
    planned.push({
      source: league,
      target: {
        id: BigInt(target.id),
        name: target.name,
        country: target.country
      },
      ruleName: target.name
    });
  }

  return planned.sort((left, right) => Number(left.target.id - right.target.id) || left.source.name.localeCompare(right.source.name));
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
      last_seen_at, created_at, updated_at
    )
    SELECT
      ${targetId}, season, team_id, player_id, source, active, is_starter,
      position, shirt_number, nationality, age, photo_url, first_seen_at,
      last_seen_at, created_at, now()
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
      updated_at = now()
  `;

  counts.playerSeasonArchives = await tx.$executeRaw`
    INSERT INTO player_season_archives (
      id, player_id, team_id, league_id, season, aggregate_scope, competition_name,
      provider, provider_player_id, provider_team_id, provider_league_id,
      appearances, starts, minutes, goals, assists, yellow_cards, red_cards,
      team_matches, source_endpoint, provenance, fetched_at, first_seen_at,
      last_seen_at, created_at, updated_at
    )
    SELECT
      'merge_' || md5(id || ':' || ${targetId}::text), player_id, team_id, ${targetId},
      season, aggregate_scope, competition_name, provider, provider_player_id,
      provider_team_id, provider_league_id, appearances, starts, minutes, goals,
      assists, yellow_cards, red_cards, team_matches, source_endpoint, provenance,
      fetched_at, first_seen_at, last_seen_at, created_at, now()
    FROM player_season_archives
    WHERE league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (provider, league_id, season, team_id, player_id, aggregate_scope) DO UPDATE SET
      competition_name = EXCLUDED.competition_name,
      provider_league_id = COALESCE(EXCLUDED.provider_league_id, player_season_archives.provider_league_id),
      appearances = COALESCE(EXCLUDED.appearances, player_season_archives.appearances),
      starts = COALESCE(EXCLUDED.starts, player_season_archives.starts),
      minutes = COALESCE(EXCLUDED.minutes, player_season_archives.minutes),
      goals = COALESCE(EXCLUDED.goals, player_season_archives.goals),
      assists = COALESCE(EXCLUDED.assists, player_season_archives.assists),
      yellow_cards = COALESCE(EXCLUDED.yellow_cards, player_season_archives.yellow_cards),
      red_cards = COALESCE(EXCLUDED.red_cards, player_season_archives.red_cards),
      team_matches = COALESCE(EXCLUDED.team_matches, player_season_archives.team_matches),
      provenance = COALESCE(EXCLUDED.provenance, player_season_archives.provenance),
      fetched_at = GREATEST(EXCLUDED.fetched_at, player_season_archives.fetched_at),
      first_seen_at = LEAST(EXCLUDED.first_seen_at, player_season_archives.first_seen_at),
      last_seen_at = GREATEST(EXCLUDED.last_seen_at, player_season_archives.last_seen_at),
      updated_at = now()
  `;

  counts.matches = await tx.$executeRaw`
    UPDATE matches
    SET league_id = ${targetId}, updated_at = now()
    WHERE league_id = ${sourceId}
    ${seasonFilter}
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

  counts.fantasyPrices = await tx.$executeRaw`
    INSERT INTO fantasy_player_prices (
      id, contest_id, league_id, season, team_id, player_id, provider, provider_player_id,
      player_name, normalized_name, team_name, sports_team_name, fotmob_player_name,
      position_label, source_kind, source_row_index, position, price,
      first_seen_at, last_seen_at
    )
    SELECT
      'merge_' || md5(source_price.id || ':' || ${targetId}::text), target_contest.id, ${targetId}, source_price.season, source_price.team_id, source_price.player_id,
      source_price.provider, source_price.provider_player_id, source_price.player_name, source_price.normalized_name, source_price.team_name, source_price.sports_team_name,
      source_price.fotmob_player_name, source_price.position_label, source_price.source_kind, source_price.source_row_index, source_price.position, source_price.price,
      source_price.first_seen_at, source_price.last_seen_at
    FROM fantasy_player_prices source_price
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_price.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_price.league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (contest_id, normalized_name, team_name) DO UPDATE SET
      contest_id = EXCLUDED.contest_id,
      team_id = COALESCE(fantasy_player_prices.team_id, EXCLUDED.team_id),
      player_id = COALESCE(fantasy_player_prices.player_id, EXCLUDED.player_id),
      provider_player_id = COALESCE(fantasy_player_prices.provider_player_id, EXCLUDED.provider_player_id),
      sports_team_name = COALESCE(fantasy_player_prices.sports_team_name, EXCLUDED.sports_team_name),
      fotmob_player_name = COALESCE(fantasy_player_prices.fotmob_player_name, EXCLUDED.fotmob_player_name),
      position_label = COALESCE(fantasy_player_prices.position_label, EXCLUDED.position_label),
      source_kind = COALESCE(fantasy_player_prices.source_kind, EXCLUDED.source_kind),
      source_row_index = COALESCE(fantasy_player_prices.source_row_index, EXCLUDED.source_row_index),
      position = COALESCE(fantasy_player_prices.position, EXCLUDED.position),
      price = CASE
        WHEN EXCLUDED.last_seen_at >= fantasy_player_prices.last_seen_at THEN EXCLUDED.price
        ELSE fantasy_player_prices.price
      END,
      first_seen_at = LEAST(fantasy_player_prices.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(fantasy_player_prices.last_seen_at, EXCLUDED.last_seen_at)
  `;

  await mergeFantasyProviderArtifacts(tx, sourceId, targetId);

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

  counts.sourcePlayerSeasonArchivesDeleted = await tx.$executeRaw`
    DELETE FROM player_season_archives
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

async function mergeFantasyProviderArtifacts(tx: Prisma.TransactionClient, sourceId: bigint, targetId: bigint) {
  const providerSeasonFilter = cli.seasons.length > 0
    ? Prisma.sql`AND source_contest.season IN (${Prisma.join(cli.seasons)})`
    : Prisma.empty;

  await tx.$executeRaw`
    UPDATE fantasy_rulesets source_ruleset
    SET contest_id = target_contest.id
    FROM sports_ru_fantasy_contests source_contest
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_ruleset.contest_id = source_contest.id
      AND source_contest.league_id = ${sourceId}
      ${providerSeasonFilter}
      AND NOT EXISTS (
        SELECT 1
        FROM fantasy_rulesets existing_ruleset
        WHERE existing_ruleset.provider = source_ruleset.provider
          AND existing_ruleset.name = source_ruleset.name
          AND existing_ruleset.version = source_ruleset.version
          AND existing_ruleset.id <> source_ruleset.id
      )
  `;

  await tx.$executeRaw`
    INSERT INTO fantasy_player_price_snapshots (
      id, contest_id, provider, league_id, season, snapshot_key, status,
      source_url, payload_hash, prices, fetched_at, created_at
    )
    SELECT
      'merge_' || md5(source_snapshot.id || ':' || ${targetId}::text), target_contest.id,
      source_snapshot.provider, ${targetId}, source_snapshot.season, source_snapshot.snapshot_key,
      source_snapshot.status, source_snapshot.source_url, source_snapshot.payload_hash,
      source_snapshot.prices, source_snapshot.fetched_at, source_snapshot.created_at
    FROM fantasy_player_price_snapshots source_snapshot
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_snapshot.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_contest.league_id = ${sourceId}
      ${providerSeasonFilter}
    ON CONFLICT (contest_id, snapshot_key) DO UPDATE SET
      status = EXCLUDED.status,
      source_url = COALESCE(EXCLUDED.source_url, fantasy_player_price_snapshots.source_url),
      payload_hash = COALESCE(EXCLUDED.payload_hash, fantasy_player_price_snapshots.payload_hash),
      prices = CASE WHEN EXCLUDED.fetched_at >= fantasy_player_price_snapshots.fetched_at THEN EXCLUDED.prices ELSE fantasy_player_price_snapshots.prices END,
      fetched_at = GREATEST(fantasy_player_price_snapshots.fetched_at, EXCLUDED.fetched_at)
  `;

  await tx.$executeRaw`
    INSERT INTO fantasy_provider_sync_runs (
      id, contest_id, provider, league_id, season, job_type, trigger,
      idempotency_key, status, started_at, finished_at, source_url,
      payload_hash, counts, error_message, created_at
    )
    SELECT
      'merge_' || md5(source_run.id || ':' || ${targetId}::text), target_contest.id,
      source_run.provider, ${targetId}, source_run.season, source_run.job_type, source_run.trigger,
      source_run.idempotency_key, source_run.status, source_run.started_at, source_run.finished_at,
      source_run.source_url, source_run.payload_hash, source_run.counts, source_run.error_message,
      source_run.created_at
    FROM fantasy_provider_sync_runs source_run
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_run.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_contest.league_id = ${sourceId}
      ${providerSeasonFilter}
    ON CONFLICT (provider, contest_id, idempotency_key) DO UPDATE SET
      status = EXCLUDED.status,
      finished_at = COALESCE(EXCLUDED.finished_at, fantasy_provider_sync_runs.finished_at),
      source_url = COALESCE(EXCLUDED.source_url, fantasy_provider_sync_runs.source_url),
      payload_hash = COALESCE(EXCLUDED.payload_hash, fantasy_provider_sync_runs.payload_hash),
      counts = COALESCE(EXCLUDED.counts, fantasy_provider_sync_runs.counts),
      error_message = COALESCE(EXCLUDED.error_message, fantasy_provider_sync_runs.error_message)
  `;

  await tx.$executeRaw`
    INSERT INTO fantasy_provider_squad_snapshots (
      id, user_id, contest_id, provider, league_id, season, gameweek,
      provider_squad_id, status, published_at, imported_at, players_count,
      mapped_players_count, selections, provider_payload, unmapped_players,
      last_error, created_at, updated_at
    )
    SELECT
      'merge_' || md5(source_snapshot.id || ':' || ${targetId}::text), source_snapshot.user_id,
      target_contest.id, source_snapshot.provider, ${targetId}, source_snapshot.season,
      source_snapshot.gameweek, source_snapshot.provider_squad_id, source_snapshot.status,
      source_snapshot.published_at, source_snapshot.imported_at, source_snapshot.players_count,
      source_snapshot.mapped_players_count, source_snapshot.selections, source_snapshot.provider_payload,
      source_snapshot.unmapped_players, source_snapshot.last_error, source_snapshot.created_at, now()
    FROM fantasy_provider_squad_snapshots source_snapshot
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_snapshot.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_contest.league_id = ${sourceId}
      ${providerSeasonFilter}
    ON CONFLICT (user_id, contest_id, gameweek, provider_squad_id) DO UPDATE SET
      status = EXCLUDED.status,
      published_at = COALESCE(EXCLUDED.published_at, fantasy_provider_squad_snapshots.published_at),
      imported_at = COALESCE(EXCLUDED.imported_at, fantasy_provider_squad_snapshots.imported_at),
      players_count = EXCLUDED.players_count,
      mapped_players_count = EXCLUDED.mapped_players_count,
      selections = COALESCE(EXCLUDED.selections, fantasy_provider_squad_snapshots.selections),
      provider_payload = COALESCE(EXCLUDED.provider_payload, fantasy_provider_squad_snapshots.provider_payload),
      unmapped_players = COALESCE(EXCLUDED.unmapped_players, fantasy_provider_squad_snapshots.unmapped_players),
      last_error = COALESCE(EXCLUDED.last_error, fantasy_provider_squad_snapshots.last_error),
      updated_at = now()
  `;

  await tx.$executeRaw`
    INSERT INTO fantasy_user_gameweek_states (
      id, user_id, contest_id, provider, league_id, season, gameweek,
      banked_free_transfers, transfers_made, transfer_cost, bank_value,
      team_value, points, captain_provider_id, vice_captain_provider_id,
      chip_code, chip_status, transfers, source_snapshot_id, observed_at,
      created_at, updated_at
    )
    SELECT
      'merge_' || md5(source_state.id || ':' || ${targetId}::text), source_state.user_id,
      target_contest.id, source_state.provider, ${targetId}, source_state.season, source_state.gameweek,
      source_state.banked_free_transfers, source_state.transfers_made, source_state.transfer_cost,
      source_state.bank_value, source_state.team_value, source_state.points, source_state.captain_provider_id,
      source_state.vice_captain_provider_id, source_state.chip_code, source_state.chip_status, source_state.transfers,
      target_snapshot.id, source_state.observed_at, source_state.created_at, now()
    FROM fantasy_user_gameweek_states source_state
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_state.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    LEFT JOIN fantasy_provider_squad_snapshots source_snapshot ON source_snapshot.id = source_state.source_snapshot_id
    LEFT JOIN fantasy_provider_squad_snapshots target_snapshot
      ON target_snapshot.user_id = source_state.user_id
      AND target_snapshot.contest_id = target_contest.id
      AND target_snapshot.gameweek = source_snapshot.gameweek
      AND target_snapshot.provider_squad_id = source_snapshot.provider_squad_id
    WHERE source_contest.league_id = ${sourceId}
      ${providerSeasonFilter}
    ON CONFLICT (user_id, contest_id, gameweek) DO UPDATE SET
      banked_free_transfers = EXCLUDED.banked_free_transfers,
      transfers_made = EXCLUDED.transfers_made,
      transfer_cost = EXCLUDED.transfer_cost,
      bank_value = COALESCE(EXCLUDED.bank_value, fantasy_user_gameweek_states.bank_value),
      team_value = COALESCE(EXCLUDED.team_value, fantasy_user_gameweek_states.team_value),
      points = COALESCE(EXCLUDED.points, fantasy_user_gameweek_states.points),
      captain_provider_id = COALESCE(EXCLUDED.captain_provider_id, fantasy_user_gameweek_states.captain_provider_id),
      vice_captain_provider_id = COALESCE(EXCLUDED.vice_captain_provider_id, fantasy_user_gameweek_states.vice_captain_provider_id),
      chip_code = COALESCE(EXCLUDED.chip_code, fantasy_user_gameweek_states.chip_code),
      chip_status = COALESCE(EXCLUDED.chip_status, fantasy_user_gameweek_states.chip_status),
      transfers = COALESCE(EXCLUDED.transfers, fantasy_user_gameweek_states.transfers),
      source_snapshot_id = COALESCE(EXCLUDED.source_snapshot_id, fantasy_user_gameweek_states.source_snapshot_id),
      observed_at = COALESCE(EXCLUDED.observed_at, fantasy_user_gameweek_states.observed_at),
      updated_at = now()
  `;

  await tx.$executeRaw`
    INSERT INTO fantasy_chip_definitions (
      id, contest_id, provider, season, code, half, max_uses, rules, created_at, updated_at
    )
    SELECT
      'merge_' || md5(source_definition.id || ':' || ${targetId}::text), target_contest.id,
      source_definition.provider, source_definition.season, source_definition.code,
      source_definition.half, source_definition.max_uses, source_definition.rules,
      source_definition.created_at, now()
    FROM fantasy_chip_definitions source_definition
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_definition.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_contest.league_id = ${sourceId}
      ${providerSeasonFilter}
    ON CONFLICT (contest_id, code, half) DO UPDATE SET
      max_uses = EXCLUDED.max_uses,
      rules = EXCLUDED.rules,
      updated_at = now()
  `;

  await tx.$executeRaw`
    INSERT INTO fantasy_chip_usages (
      id, user_id, contest_id, provider, season, gameweek, code, status,
      source, observed_at, metadata, created_at, updated_at
    )
    SELECT
      'merge_' || md5(source_usage.id || ':' || ${targetId}::text), source_usage.user_id,
      target_contest.id, source_usage.provider, source_usage.season, source_usage.gameweek,
      source_usage.code, source_usage.status, source_usage.source, source_usage.observed_at,
      source_usage.metadata, source_usage.created_at, now()
    FROM fantasy_chip_usages source_usage
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_usage.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_contest.league_id = ${sourceId}
      ${providerSeasonFilter}
    ON CONFLICT (user_id, contest_id, gameweek) DO UPDATE SET
      code = EXCLUDED.code,
      status = EXCLUDED.status,
      source = EXCLUDED.source,
      observed_at = COALESCE(EXCLUDED.observed_at, fantasy_chip_usages.observed_at),
      metadata = COALESCE(EXCLUDED.metadata, fantasy_chip_usages.metadata),
      updated_at = now()
  `;

  await tx.$executeRaw`
    INSERT INTO fantasy_provider_player_match_scores (
      id, contest_id, provider, provider_event_id, provider_player_id, gameweek,
      league_id, season, player_id, match_id, points, breakdown, status,
      source_url, fetched_at, created_at, updated_at
    )
    SELECT
      'merge_' || md5(source_score.id || ':' || ${targetId}::text), target_contest.id,
      source_score.provider, source_score.provider_event_id, source_score.provider_player_id,
      source_score.gameweek, ${targetId}, source_score.season, source_score.player_id,
      source_score.match_id, source_score.points, source_score.breakdown, source_score.status,
      source_score.source_url, source_score.fetched_at, source_score.created_at, now()
    FROM fantasy_provider_player_match_scores source_score
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_score.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_contest.league_id = ${sourceId}
      ${providerSeasonFilter}
    ON CONFLICT (contest_id, provider_event_id, provider_player_id) DO UPDATE SET
      player_id = COALESCE(EXCLUDED.player_id, fantasy_provider_player_match_scores.player_id),
      match_id = COALESCE(EXCLUDED.match_id, fantasy_provider_player_match_scores.match_id),
      points = EXCLUDED.points,
      breakdown = EXCLUDED.breakdown,
      status = EXCLUDED.status,
      source_url = COALESCE(EXCLUDED.source_url, fantasy_provider_player_match_scores.source_url),
      fetched_at = GREATEST(fantasy_provider_player_match_scores.fetched_at, EXCLUDED.fetched_at),
      updated_at = now()
  `;

  await tx.$executeRaw`
    INSERT INTO "ProviderEntityMap" (
      "id", "contest_id", "provider", "provider_season", "provider_entity_code",
      "providerEntityType", "providerEntityId", "internalEntityType", "internalEntityId",
      "confidence", "matchedBy", "status", "createdAt", "updatedAt"
    )
    SELECT
      'merge_' || md5(source_map."id" || ':' || ${targetId}::text), target_contest.id,
      source_map."provider", source_map."provider_season", source_map."provider_entity_code",
      source_map."providerEntityType", source_map."providerEntityId", source_map."internalEntityType",
      source_map."internalEntityId", source_map."confidence", source_map."matchedBy", source_map."status",
      source_map."createdAt", now()
    FROM "ProviderEntityMap" source_map
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_map."contest_id"
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_contest.league_id = ${sourceId}
      AND source_map."providerEntityType" <> 'FANTASY_PLAYER_PRICE'
      ${providerSeasonFilter}
    ON CONFLICT ("provider", "provider_season", "providerEntityType", "providerEntityId", "internalEntityType") DO UPDATE SET
      "contest_id" = COALESCE("ProviderEntityMap"."contest_id", EXCLUDED."contest_id"),
      "internalEntityId" = COALESCE("ProviderEntityMap"."internalEntityId", EXCLUDED."internalEntityId"),
      "confidence" = GREATEST("ProviderEntityMap"."confidence", EXCLUDED."confidence"),
      "matchedBy" = COALESCE("ProviderEntityMap"."matchedBy", EXCLUDED."matchedBy"),
      "status" = CASE WHEN "ProviderEntityMap"."status" = 'MATCHED' THEN 'MATCHED' ELSE EXCLUDED."status" END,
      "updatedAt" = now()
  `;

  await tx.$executeRaw`
    INSERT INTO "ProviderEntityMap" (
      "id", "contest_id", "provider", "provider_season", "provider_entity_code",
      "providerEntityType", "providerEntityId", "internalEntityType", "internalEntityId",
      "confidence", "matchedBy", "status", "createdAt", "updatedAt"
    )
    SELECT
      'merge_' || md5(source_map."id" || ':' || ${targetId}::text), target_contest.id,
      source_map."provider", source_map."provider_season", source_map."provider_entity_code",
      source_map."providerEntityType", target_price.id, source_map."internalEntityType",
      source_map."internalEntityId", source_map."confidence", source_map."matchedBy", source_map."status",
      source_map."createdAt", now()
    FROM "ProviderEntityMap" source_map
    JOIN fantasy_player_prices source_price
      ON source_map."providerEntityType" = 'FANTASY_PLAYER_PRICE'
      AND source_map."providerEntityId" = source_price.id
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_price.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    JOIN fantasy_player_prices target_price
      ON target_price.contest_id = target_contest.id
      AND target_price.provider = source_price.provider
      AND (
        (source_price.provider_player_id IS NOT NULL AND target_price.provider_player_id = source_price.provider_player_id)
        OR (source_price.provider_player_id IS NULL AND target_price.normalized_name = source_price.normalized_name AND target_price.team_name = source_price.team_name)
      )
    WHERE source_contest.league_id = ${sourceId}
      ${providerSeasonFilter}
    ON CONFLICT ("provider", "provider_season", "providerEntityType", "providerEntityId", "internalEntityType") DO UPDATE SET
      "contest_id" = COALESCE("ProviderEntityMap"."contest_id", EXCLUDED."contest_id"),
      "internalEntityId" = COALESCE("ProviderEntityMap"."internalEntityId", EXCLUDED."internalEntityId"),
      "confidence" = GREATEST("ProviderEntityMap"."confidence", EXCLUDED."confidence"),
      "matchedBy" = COALESCE("ProviderEntityMap"."matchedBy", EXCLUDED."matchedBy"),
      "status" = CASE WHEN "ProviderEntityMap"."status" = 'MATCHED' THEN 'MATCHED' ELSE EXCLUDED."status" END,
      "updatedAt" = now()
  `;
}

async function mergeFantasySquads(tx: Prisma.TransactionClient, sourceId: bigint, targetId: bigint, seasonFilter: Prisma.Sql) {
  const sourceSquadSeasonFilter = cli.seasons.length > 0 ? Prisma.sql`AND source_squad.season IN (${Prisma.join(cli.seasons)})` : Prisma.empty;

  await tx.$executeRaw`
    INSERT INTO user_fantasy_squads (
      id, user_id, provider, contest_id, league_id, season, name, budget_limit, bank,
      horizon_rounds, filters, created_at, updated_at
    )
    SELECT
      'merge_' || md5(source_squad.id || ':' || ${targetId}::text), source_squad.user_id, source_squad.provider, target_contest.id, ${targetId}, source_squad.season,
      source_squad.name, source_squad.budget_limit, source_squad.bank, source_squad.horizon_rounds, source_squad.filters, source_squad.created_at, now()
    FROM user_fantasy_squads source_squad
    JOIN sports_ru_fantasy_contests source_contest ON source_contest.id = source_squad.contest_id
    JOIN sports_ru_fantasy_contests target_contest
      ON target_contest.provider = source_contest.provider
      AND target_contest.league_id = ${targetId}
      AND target_contest.season = source_contest.season
    WHERE source_squad.league_id = ${sourceId}
    ${seasonFilter}
    ON CONFLICT (user_id, contest_id, name) DO UPDATE SET
      budget_limit = EXCLUDED.budget_limit,
      bank = EXCLUDED.bank,
      horizon_rounds = EXCLUDED.horizon_rounds,
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
      AND target_squad.provider = source_squad.provider
      AND target_squad.contest_id = (
        SELECT target_contest.id
        FROM sports_ru_fantasy_contests target_contest
        WHERE target_contest.provider = source_squad.provider
          AND target_contest.league_id = ${targetId}
          AND target_contest.season = source_squad.season
      )
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
