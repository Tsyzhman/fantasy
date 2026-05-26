import { PrismaClient } from "@prisma/client";

import { hasDatabaseUrl, isDatabaseConfigured } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  scoringSchemaPromise?: Promise<void>;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { hasDatabaseUrl, isDatabaseConfigured };

export function ensureDatabaseSchema() {
  if (process.env.NEXT_PHASE === "phase-production-build") return Promise.resolve();
  if (!isDatabaseConfigured()) return Promise.resolve();

  globalForPrisma.scoringSchemaPromise ??= prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF to_regclass('"PlayerSnapshot"') IS NOT NULL THEN
    ALTER TABLE "PlayerSnapshot" ADD COLUMN IF NOT EXISTS "scoringScore" DOUBLE PRECISION;
    CREATE INDEX IF NOT EXISTS "PlayerSnapshot_scoringScore_idx" ON "PlayerSnapshot"("scoringScore");
  END IF;

  IF to_regclass('"MachetePlayerSnapshot"') IS NOT NULL THEN
    ALTER TABLE "MachetePlayerSnapshot" ADD COLUMN IF NOT EXISTS "scoringScore" DOUBLE PRECISION;

    WITH ranked_snapshots AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "playerId", COALESCE("leagueId", ''), COALESCE("teamId", '')
          ORDER BY "createdAt" DESC, id DESC
        ) AS row_number
      FROM "MachetePlayerSnapshot"
      WHERE "periodFrom" IS NULL AND "periodTo" IS NULL
    )
    DELETE FROM "MachetePlayerSnapshot"
    WHERE id IN (
      SELECT id FROM ranked_snapshots WHERE row_number > 1
    );

    CREATE INDEX IF NOT EXISTS "MachetePlayerSnapshot_scoringScore_idx" ON "MachetePlayerSnapshot"("scoringScore");
    CREATE UNIQUE INDEX IF NOT EXISTS "MachetePlayerSnapshot_current_unique_idx"
      ON "MachetePlayerSnapshot"("playerId", (COALESCE("leagueId", '')), (COALESCE("teamId", '')))
      WHERE "periodFrom" IS NULL AND "periodTo" IS NULL;
  END IF;

  IF to_regclass('"FantasyModel"') IS NOT NULL THEN
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaGk" TEXT;
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaDef" TEXT;
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaMid" TEXT;
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaFwd" TEXT;
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaEnabled" BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF to_regclass('"User"') IS NOT NULL THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
  END IF;

  IF to_regclass('"UserSession"') IS NULL THEN
    CREATE TABLE "UserSession" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
    CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");
    CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
    ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('sports_ru_fantasy_contests') IS NULL THEN
    CREATE TABLE "sports_ru_fantasy_contests" (
      "id" TEXT NOT NULL,
      "league_id" BIGINT NOT NULL,
      "season" TEXT NOT NULL,
      "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
      "provider_contest_id" TEXT,
      "slug" TEXT,
      "name" TEXT NOT NULL,
      "budget_limit" DOUBLE PRECISION NOT NULL DEFAULT 100,
      "squad_size" INTEGER NOT NULL DEFAULT 15,
      "max_players_per_team" INTEGER NOT NULL DEFAULT 2,
      "rules" JSONB,
      "source_url" TEXT,
      "last_synced_at" TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "sports_ru_fantasy_contests_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "sports_ru_fantasy_contests_provider_league_season_key"
      ON "sports_ru_fantasy_contests"("provider", "league_id", "season");
    CREATE INDEX "sports_ru_fantasy_contests_league_season_idx"
      ON "sports_ru_fantasy_contests"("league_id", "season");
    ALTER TABLE "sports_ru_fantasy_contests" ADD CONSTRAINT "sports_ru_fantasy_contests_league_id_fkey"
      FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('fantasy_player_prices') IS NULL THEN
    CREATE TABLE "fantasy_player_prices" (
      "id" TEXT NOT NULL,
      "league_id" BIGINT NOT NULL,
      "season" TEXT NOT NULL,
      "team_id" BIGINT,
      "player_id" BIGINT,
      "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
      "provider_player_id" TEXT,
      "player_name" TEXT NOT NULL,
      "normalized_name" TEXT NOT NULL,
      "team_name" TEXT NOT NULL DEFAULT '',
      "position" TEXT,
      "price" DOUBLE PRECISION NOT NULL,
      "raw" JSONB,
      "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "fantasy_player_prices_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "fantasy_player_prices_provider_league_season_name_team_key"
      ON "fantasy_player_prices"("provider", "league_id", "season", "normalized_name", "team_name");
    CREATE INDEX "fantasy_player_prices_player_league_season_idx"
      ON "fantasy_player_prices"("player_id", "league_id", "season");
    CREATE INDEX "fantasy_player_prices_team_league_season_idx"
      ON "fantasy_player_prices"("team_id", "league_id", "season");
    ALTER TABLE "fantasy_player_prices" ADD CONSTRAINT "fantasy_player_prices_league_id_fkey"
      FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "fantasy_player_prices" ADD CONSTRAINT "fantasy_player_prices_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "fantasy_player_prices" ADD CONSTRAINT "fantasy_player_prices_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF to_regclass('user_fantasy_squads') IS NULL THEN
    CREATE TABLE "user_fantasy_squads" (
      "id" TEXT NOT NULL,
      "user_id" TEXT NOT NULL,
      "league_id" BIGINT NOT NULL,
      "season" TEXT NOT NULL,
      "name" TEXT NOT NULL DEFAULT 'My squad',
      "budget_limit" DOUBLE PRECISION NOT NULL DEFAULT 100,
      "bank" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "horizon_rounds" INTEGER NOT NULL DEFAULT 5,
      "filters" JSONB,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "user_fantasy_squads_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "user_fantasy_squads_user_league_season_key"
      ON "user_fantasy_squads"("user_id", "league_id", "season");
    CREATE INDEX "user_fantasy_squads_league_season_idx"
      ON "user_fantasy_squads"("league_id", "season");
    ALTER TABLE "user_fantasy_squads" ADD CONSTRAINT "user_fantasy_squads_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "user_fantasy_squads" ADD CONSTRAINT "user_fantasy_squads_league_id_fkey"
      FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('user_fantasy_squad_players') IS NULL THEN
    CREATE TABLE "user_fantasy_squad_players" (
      "id" TEXT NOT NULL,
      "squad_id" TEXT NOT NULL,
      "player_id" BIGINT NOT NULL,
      "team_id" BIGINT,
      "position" TEXT,
      "is_starter" BOOLEAN NOT NULL DEFAULT true,
      "is_locked" BOOLEAN NOT NULL DEFAULT false,
      "is_captain" BOOLEAN NOT NULL DEFAULT false,
      "is_vice_captain" BOOLEAN NOT NULL DEFAULT false,
      "slot_index" INTEGER NOT NULL DEFAULT 0,
      "purchase_price" DOUBLE PRECISION,
      "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "user_fantasy_squad_players_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "user_fantasy_squad_players_squad_player_key"
      ON "user_fantasy_squad_players"("squad_id", "player_id");
    CREATE INDEX "user_fantasy_squad_players_player_idx"
      ON "user_fantasy_squad_players"("player_id");
    CREATE INDEX "user_fantasy_squad_players_team_idx"
      ON "user_fantasy_squad_players"("team_id");
    ALTER TABLE "user_fantasy_squad_players" ADD CONSTRAINT "user_fantasy_squad_players_squad_id_fkey"
      FOREIGN KEY ("squad_id") REFERENCES "user_fantasy_squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "user_fantasy_squad_players" ADD CONSTRAINT "user_fantasy_squad_players_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "user_fantasy_squad_players" ADD CONSTRAINT "user_fantasy_squad_players_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

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
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "user_saved_views_user_source_href_key"
    ON "user_saved_views"("user_id", "source", "href");
  CREATE INDEX IF NOT EXISTS "user_saved_views_user_source_updated_at_idx"
    ON "user_saved_views"("user_id", "source", "updated_at");
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_saved_views_user_id_fkey'
  ) THEN
    ALTER TABLE "user_saved_views" ADD CONSTRAINT "user_saved_views_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

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
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "user_watchlist_players_user_source_player_key_key"
    ON "user_watchlist_players"("user_id", "source", "player_key");
  CREATE INDEX IF NOT EXISTS "user_watchlist_players_user_source_updated_at_idx"
    ON "user_watchlist_players"("user_id", "source", "updated_at");
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_watchlist_players_user_id_fkey'
  ) THEN
    ALTER TABLE "user_watchlist_players" ADD CONSTRAINT "user_watchlist_players_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  CREATE TABLE IF NOT EXISTS "shotmap_presets" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shotmap_presets_pkey" PRIMARY KEY ("id")
  );

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
  );
  CREATE INDEX IF NOT EXISTS "shotmap_comparisons_cache_expires_at_idx"
    ON "shotmap_comparisons_cache"("expires_at");

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
`)
    .then(() => undefined)
    .catch((error) => {
      console.error("[db] Failed to ensure database schema.", error);
    });

  return globalForPrisma.scoringSchemaPromise;
}
