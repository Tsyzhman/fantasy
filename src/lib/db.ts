import { PrismaClient } from "@prisma/client";

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

export function ensureDatabaseSchema() {
  if (process.env.NEXT_PHASE === "phase-production-build") return Promise.resolve();
  if (!process.env.DATABASE_URL) return Promise.resolve();

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

END $$;
`)
    .then(() => undefined)
    .catch((error) => {
      console.error("[db] Failed to ensure database schema.", error);
    });

  return globalForPrisma.scoringSchemaPromise;
}
