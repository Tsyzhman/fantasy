import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

loadDotEnvIfNeeded();
assertPostgresDatabaseUrl();

const prisma = new PrismaClient();

const protectedTables = ["raw_match_payloads", "matches", "match_team_stats", "match_player_stats", "match_shots", "fantasy_points"] as const;

const additiveStatements = [
  `
  CREATE TABLE IF NOT EXISTS "league_seasons" (
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "calendar_type" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "provider_season" TEXT,
    "name" TEXT,
    "country" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "league_seasons_pkey" PRIMARY KEY ("league_id", "season"),
    CONSTRAINT "league_seasons_league_id_fkey"
      FOREIGN KEY ("league_id") REFERENCES "leagues"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS "league_season_teams" (
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "team_id" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "league_season_teams_pkey" PRIMARY KEY ("league_id", "season", "team_id"),
    CONSTRAINT "league_season_teams_league_id_season_fkey"
      FOREIGN KEY ("league_id", "season") REFERENCES "league_seasons"("league_id", "season")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "league_season_teams_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "teams"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS "team_player_seasons" (
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "team_id" BIGINT NOT NULL,
    "player_id" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'fotmob',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_starter" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT,
    "shirt_number" INTEGER,
    "nationality" TEXT,
    "age" INTEGER,
    "photo_url" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roster_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_player_seasons_pkey" PRIMARY KEY ("league_id", "season", "team_id", "player_id"),
    CONSTRAINT "team_player_seasons_league_id_season_team_id_fkey"
      FOREIGN KEY ("league_id", "season", "team_id") REFERENCES "league_season_teams"("league_id", "season", "team_id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_player_seasons_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "teams"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_player_seasons_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "players"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS "user_saved_views" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "filters" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_saved_views_pkey" PRIMARY KEY ("id")
  )
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_saved_views_user_source_href_key" ON "user_saved_views"("user_id", "source", "href")`,
  `CREATE INDEX IF NOT EXISTS "user_saved_views_user_source_updated_at_idx" ON "user_saved_views"("user_id", "source", "updated_at")`,
  `
  DO $$
  BEGIN
    IF to_regclass('user_fantasy_squad_players') IS NOT NULL THEN
      ALTER TABLE "user_fantasy_squad_players" ADD COLUMN IF NOT EXISTS "is_captain" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE "user_fantasy_squad_players" ADD COLUMN IF NOT EXISTS "is_vice_captain" BOOLEAN NOT NULL DEFAULT false;
      CREATE UNIQUE INDEX IF NOT EXISTS "user_fantasy_squad_players_one_captain_idx"
        ON "user_fantasy_squad_players"("squad_id") WHERE "is_captain";
      CREATE UNIQUE INDEX IF NOT EXISTS "user_fantasy_squad_players_one_vice_captain_idx"
        ON "user_fantasy_squad_players"("squad_id") WHERE "is_vice_captain";
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_fantasy_squad_players_captain_distinct_check'
      ) THEN
        ALTER TABLE "user_fantasy_squad_players" ADD CONSTRAINT "user_fantasy_squad_players_captain_distinct_check"
          CHECK (NOT ("is_captain" AND "is_vice_captain"));
      END IF;
    END IF;
  END $$;
  `,
  `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_saved_views_user_id_fkey') THEN
      ALTER TABLE "user_saved_views" ADD CONSTRAINT "user_saved_views_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;
  `,
  `
  CREATE TABLE IF NOT EXISTS "user_watchlist_players" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "player_key" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "team_name" TEXT,
    "position" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_watchlist_players_pkey" PRIMARY KEY ("id")
  )
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_watchlist_players_user_source_player_key_key" ON "user_watchlist_players"("user_id", "source", "player_key")`,
  `CREATE INDEX IF NOT EXISTS "user_watchlist_players_user_source_updated_at_idx" ON "user_watchlist_players"("user_id", "source", "updated_at")`,
  `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_watchlist_players_user_id_fkey') THEN
      ALTER TABLE "user_watchlist_players" ADD CONSTRAINT "user_watchlist_players_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;
  `,
  `CREATE INDEX IF NOT EXISTS "league_seasons_source_is_current_idx" ON "league_seasons"("source", "is_current")`,
  `CREATE INDEX IF NOT EXISTS "league_season_teams_team_id_league_id_season_idx" ON "league_season_teams"("team_id", "league_id", "season")`,
  `CREATE INDEX IF NOT EXISTS "team_player_seasons_player_id_league_id_season_idx" ON "team_player_seasons"("player_id", "league_id", "season")`,
  `CREATE INDEX IF NOT EXISTS "team_player_seasons_team_id_league_id_season_idx" ON "team_player_seasons"("team_id", "league_id", "season")`,
  `ALTER TABLE "team_player_seasons" ADD COLUMN IF NOT EXISTS "is_starter" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS "team_player_seasons_is_starter_idx" ON "team_player_seasons"("is_starter")`,
  `
  CREATE TABLE IF NOT EXISTS "shotmap_presets" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shotmap_presets_pkey" PRIMARY KEY ("id")
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS "shotmap_comparisons_cache" (
    "cache_key" TEXT NOT NULL,
    "query_params" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "source_match_ids" JSONB NOT NULL,
    "payload_hashes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shotmap_comparisons_cache_pkey" PRIMARY KEY ("cache_key")
  )
  `,
  `CREATE INDEX IF NOT EXISTS "shotmap_comparisons_cache_expires_at_idx" ON "shotmap_comparisons_cache"("expires_at")`,
  `
  DO $$
  BEGIN
    IF to_regclass('match_shots') IS NOT NULL THEN
      ALTER TABLE "match_shots" ADD COLUMN IF NOT EXISTS "normalized_x" DOUBLE PRECISION;
      ALTER TABLE "match_shots" ADD COLUMN IF NOT EXISTS "normalized_y" DOUBLE PRECISION;
      ALTER TABLE "match_shots" ADD COLUMN IF NOT EXISTS "event_type" TEXT;
      ALTER TABLE "match_shots" ADD COLUMN IF NOT EXISTS "shot_type" TEXT;
      ALTER TABLE "match_shots" ADD COLUMN IF NOT EXISTS "body_part" TEXT;
      ALTER TABLE "match_shots" ADD COLUMN IF NOT EXISTS "situation" TEXT;
      ALTER TABLE "match_shots" ADD COLUMN IF NOT EXISTS "is_big_chance" BOOLEAN;
      ALTER TABLE "match_shots" ADD COLUMN IF NOT EXISTS "source_fingerprint" TEXT;
      UPDATE "match_shots"
      SET "source_fingerprint" = md5(concat_ws(
        ':',
        'legacy',
        "id"::text,
        "match_id"::text,
        COALESCE("team_id"::text, ''),
        COALESCE("player_id"::text, ''),
        COALESCE("minute"::text, ''),
        COALESCE("added_time"::text, ''),
        COALESCE("x"::text, ''),
        COALESCE("y"::text, ''),
        COALESCE("event_type", '')
      ))
      WHERE "source_fingerprint" IS NULL;
      ALTER TABLE "match_shots" ALTER COLUMN "source_fingerprint" SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "match_shots_match_id_source_fingerprint_key"
        ON "match_shots"("match_id", "source_fingerprint");
    END IF;
  END $$;
  `
];

async function main() {
  console.log("[db:safe-update] Checking already downloaded shared FotMob data.");
  const before = await protectedCounts();
  printCounts("before", before);

  await prisma.$transaction(async (tx) => {
    for (const statement of additiveStatements) {
      await tx.$executeRawUnsafe(statement);
    }
  });

  const after = await protectedCounts();
  printCounts("after", after);
  assertCountsDidNotDrop(before, after);

  console.log("[db:safe-update] Additive schema update completed. Existing match payload data was not deleted.");
}

async function protectedCounts() {
  const entries = await Promise.all(protectedTables.map(async (table) => [table, await tableCount(table)] as const));
  return Object.fromEntries(entries) as Record<(typeof protectedTables)[number], bigint | null>;
}

async function tableCount(table: (typeof protectedTables)[number]) {
  const tableExists = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
    `SELECT to_regclass('public.${table}')::text AS "exists"`
  );
  if (!tableExists[0]?.exists) return null;

  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS "count" FROM "${table}"`);
  return rows[0]?.count ?? 0n;
}

function assertCountsDidNotDrop(before: Record<string, bigint | null>, after: Record<string, bigint | null>) {
  for (const table of protectedTables) {
    const previous = before[table];
    const current = after[table];
    if (previous !== null && current !== null && current < previous) {
      throw new Error(`Safety check failed: ${table} row count dropped from ${previous} to ${current}.`);
    }
  }
}

function printCounts(label: string, counts: Record<string, bigint | null>) {
  console.log(`[db:safe-update] ${label}:`);
  for (const table of protectedTables) {
    const count = counts[table];
    console.log(`  ${table}: ${count === null ? "missing" : count.toString()}`);
  }
}

function loadDotEnvIfNeeded() {
  if (process.env.DATABASE_URL) return;

  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (key !== "DATABASE_URL") continue;

    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    process.env.DATABASE_URL = value;
    return;
  }
}

function assertPostgresDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required. The safe update refuses to run without an explicit database target.");
  }
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must point to PostgreSQL. The safe update refuses to run on an unknown database target.");
  }
}

main()
  .catch((error) => {
    console.error("[db:safe-update] Failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
