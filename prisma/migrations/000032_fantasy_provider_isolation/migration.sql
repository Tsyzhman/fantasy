-- Provider/contest isolation for multiple fantasy products over one core league.
-- This migration is deliberately additive and backfills all legacy Sports.ru rows
-- before making the new contest dimension mandatory.

DO $$
BEGIN
  IF to_regclass('"sports_ru_fantasy_contests"') IS NOT NULL
     AND to_regclass('"fantasy_contests"') IS NULL THEN
    ALTER TABLE "sports_ru_fantasy_contests" RENAME TO "fantasy_contests";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sports_ru_fantasy_contests_pkey'
      AND conrelid = 'fantasy_contests'::regclass
  ) THEN
    ALTER TABLE "fantasy_contests"
      RENAME CONSTRAINT "sports_ru_fantasy_contests_pkey" TO "fantasy_contests_pkey";
  END IF;
END $$;

ALTER INDEX IF EXISTS "sports_ru_fantasy_contests_provider_league_id_season_key"
  RENAME TO "fantasy_contests_provider_league_id_season_key";
ALTER INDEX IF EXISTS "sports_ru_fantasy_contests_league_id_season_idx"
  RENAME TO "fantasy_contests_league_id_season_idx";

ALTER TABLE "fantasy_player_prices"
  ADD COLUMN IF NOT EXISTS "contest_id" TEXT;

ALTER TABLE "user_fantasy_squads"
  ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
  ADD COLUMN IF NOT EXISTS "contest_id" TEXT;

ALTER TABLE "fantasy_rulesets"
  ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'CORE',
  ADD COLUMN IF NOT EXISTS "contest_id" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "fantasy_rulesets"
    WHERE "provider" <> 'CORE' AND "contest_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Provider-specific fantasy rulesets require contest_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fantasy_rulesets_provider_contest_required'
  ) THEN
    ALTER TABLE "fantasy_rulesets"
      ADD CONSTRAINT "fantasy_rulesets_provider_contest_required"
      CHECK ("provider" = 'CORE' OR "contest_id" IS NOT NULL);
  END IF;
END $$;

ALTER TABLE "ProviderEntityMap"
  ADD COLUMN IF NOT EXISTS "contest_id" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_season" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS "provider_entity_code" TEXT;

UPDATE "ProviderEntityMap"
SET "provider_season" = 'LEGACY'
WHERE "provider_season" IS NULL;

ALTER TABLE "ProviderEntityMap"
  ALTER COLUMN "provider_season" SET NOT NULL;

-- Existing deployments can contain prices or squads created before a contest
-- row was required. Give each legacy scope a deterministic contest identity.
INSERT INTO "fantasy_contests" (
  "id", "league_id", "season", "provider", "name", "budget_limit",
  "squad_size", "max_players_per_team", "created_at", "updated_at"
)
SELECT
  'legacy_' || md5(scope."provider" || ':' || scope."league_id"::text || ':' || scope."season"),
  scope."league_id",
  scope."season",
  scope."provider",
  CASE WHEN scope."provider" = 'SPORTS_RU' THEN 'Sports.ru legacy contest' ELSE scope."provider" || ' legacy contest' END,
  100,
  15,
  CASE WHEN scope."league_id" IN (47, 87, 88, 89, 90) THEN 3 ELSE 2 END,
  now(),
  now()
FROM (
  SELECT DISTINCT "provider", "league_id", "season" FROM "fantasy_player_prices"
  UNION
  SELECT DISTINCT "provider", "league_id", "season" FROM "user_fantasy_squads"
) AS scope
WHERE NOT EXISTS (
  SELECT 1
  FROM "fantasy_contests" contest
  WHERE contest."provider" = scope."provider"
    AND contest."league_id" = scope."league_id"
    AND contest."season" = scope."season"
)
ON CONFLICT ("provider", "league_id", "season") DO NOTHING;

UPDATE "fantasy_player_prices" prices
SET "contest_id" = contests."id"
FROM "fantasy_contests" contests
WHERE prices."contest_id" IS NULL
  AND contests."provider" = prices."provider"
  AND contests."league_id" = prices."league_id"
  AND contests."season" = prices."season";

UPDATE "user_fantasy_squads" squads
SET "contest_id" = contests."id"
FROM "fantasy_contests" contests
WHERE squads."contest_id" IS NULL
  AND contests."provider" = squads."provider"
  AND contests."league_id" = squads."league_id"
  AND contests."season" = squads."season";

-- Legacy Sports provider maps that point at a price row can inherit the same
-- contest. Generic FotMob maps intentionally remain contest-less: they are
-- shared core identity maps, not provider contest identities.
UPDATE "ProviderEntityMap" maps
SET "contest_id" = prices."contest_id"
FROM "fantasy_player_prices" prices
WHERE maps."contest_id" IS NULL
  AND maps."provider" = prices."provider"
  AND maps."providerEntityType" = 'FANTASY_PLAYER_PRICE'
  AND maps."providerEntityId" = prices."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "fantasy_player_prices" WHERE "contest_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot complete fantasy provider migration: price rows without a contest remain';
  END IF;
  IF EXISTS (SELECT 1 FROM "user_fantasy_squads" WHERE "contest_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot complete fantasy provider migration: squads without a contest remain';
  END IF;
END $$;

ALTER TABLE "fantasy_player_prices" ALTER COLUMN "contest_id" SET NOT NULL;
ALTER TABLE "user_fantasy_squads" ALTER COLUMN "contest_id" SET NOT NULL;

DROP INDEX IF EXISTS "user_fantasy_squads_user_id_league_id_season_key";
DROP INDEX IF EXISTS "user_fantasy_squads_user_id_league_id_season_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "user_fantasy_squads_user_id_contest_id_name_key"
  ON "user_fantasy_squads" ("user_id", "contest_id", "name");
CREATE INDEX IF NOT EXISTS "user_fantasy_squads_user_id_contest_id_updated_at_idx"
  ON "user_fantasy_squads" ("user_id", "contest_id", "updated_at");
CREATE INDEX IF NOT EXISTS "user_fantasy_squads_provider_league_id_season_idx"
  ON "user_fantasy_squads" ("provider", "league_id", "season");

CREATE UNIQUE INDEX IF NOT EXISTS "fantasy_player_prices_contest_provider_player_id_key"
  ON "fantasy_player_prices" ("contest_id", "provider_player_id");
CREATE INDEX IF NOT EXISTS "fantasy_player_prices_contest_last_seen_at_idx"
  ON "fantasy_player_prices" ("contest_id", "last_seen_at");
DROP INDEX IF EXISTS "fantasy_player_prices_provider_league_id_season_normalized__key";
DROP INDEX IF EXISTS "fantasy_player_prices_provider_league_id_season_normalized_name_team_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "fantasy_player_prices_contest_normalized_name_team_name_key"
  ON "fantasy_player_prices" ("contest_id", "normalized_name", "team_name");
CREATE INDEX IF NOT EXISTS "ProviderEntityMap_contest_id_idx"
  ON "ProviderEntityMap" ("contest_id");
CREATE INDEX IF NOT EXISTS "fantasy_rulesets_provider_contest_id_idx"
  ON "fantasy_rulesets" ("provider", "contest_id");

DROP INDEX IF EXISTS "fantasy_rulesets_name_version_key";
CREATE UNIQUE INDEX IF NOT EXISTS "fantasy_rulesets_provider_name_version_key"
  ON "fantasy_rulesets" ("provider", "name", "version");

DROP INDEX IF EXISTS "ProviderEntityMap_provider_providerEntityType_providerEntit_key";
CREATE UNIQUE INDEX IF NOT EXISTS "provider_entity_map_provider_season_entity_key"
  ON "ProviderEntityMap" ("provider", "provider_season", "providerEntityType", "providerEntityId", "internalEntityType");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_player_prices_contest_id_fkey'
  ) THEN
    ALTER TABLE "fantasy_player_prices"
      ADD CONSTRAINT "fantasy_player_prices_contest_id_fkey"
      FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_fantasy_squads_contest_id_fkey'
  ) THEN
    ALTER TABLE "user_fantasy_squads"
      ADD CONSTRAINT "user_fantasy_squads_contest_id_fkey"
      FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_rulesets_contest_id_fkey'
  ) THEN
    ALTER TABLE "fantasy_rulesets"
      ADD CONSTRAINT "fantasy_rulesets_contest_id_fkey"
      FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderEntityMap_contest_id_fkey'
  ) THEN
    ALTER TABLE "ProviderEntityMap"
      ADD CONSTRAINT "ProviderEntityMap_contest_id_fkey"
      FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE "fantasy_player_price_snapshots" (
  "id" TEXT NOT NULL,
  "contest_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "league_id" BIGINT NOT NULL,
  "season" TEXT NOT NULL,
  "snapshot_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "source_url" TEXT,
  "payload_hash" TEXT,
  "prices" JSONB NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fantasy_player_price_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fantasy_price_snapshots_contest_snapshot_key"
  ON "fantasy_player_price_snapshots" ("contest_id", "snapshot_key");
CREATE INDEX "fantasy_price_snapshots_provider_league_season_fetched_idx"
  ON "fantasy_player_price_snapshots" ("provider", "league_id", "season", "fetched_at");

CREATE TABLE "fantasy_provider_sync_runs" (
  "id" TEXT NOT NULL,
  "contest_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "league_id" BIGINT NOT NULL,
  "season" TEXT NOT NULL,
  "job_type" TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "source_url" TEXT,
  "payload_hash" TEXT,
  "counts" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fantasy_provider_sync_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fantasy_provider_sync_runs_idempotency_key"
  ON "fantasy_provider_sync_runs" ("provider", "contest_id", "idempotency_key");
CREATE INDEX "fantasy_provider_sync_runs_scope_idx"
  ON "fantasy_provider_sync_runs" ("provider", "league_id", "season", "job_type", "started_at");

CREATE TABLE "fantasy_provider_squad_snapshots" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "contest_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "league_id" BIGINT NOT NULL,
  "season" TEXT NOT NULL,
  "gameweek" INTEGER NOT NULL,
  "provider_squad_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "published_at" TIMESTAMP(3),
  "imported_at" TIMESTAMP(3),
  "players_count" INTEGER NOT NULL DEFAULT 0,
  "mapped_players_count" INTEGER NOT NULL DEFAULT 0,
  "selections" JSONB,
  "provider_payload" JSONB,
  "unmapped_players" JSONB,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fantasy_provider_squad_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fantasy_provider_squad_snapshot_scope_key"
  ON "fantasy_provider_squad_snapshots" ("user_id", "contest_id", "gameweek", "provider_squad_id");
CREATE INDEX "fantasy_provider_squad_snapshots_scope_idx"
  ON "fantasy_provider_squad_snapshots" ("provider", "league_id", "season", "gameweek", "status");

CREATE TABLE "fantasy_user_gameweek_states" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "contest_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "league_id" BIGINT NOT NULL,
  "season" TEXT NOT NULL,
  "gameweek" INTEGER NOT NULL,
  "banked_free_transfers" INTEGER NOT NULL DEFAULT 1,
  "transfers_made" INTEGER NOT NULL DEFAULT 0,
  "transfer_cost" INTEGER NOT NULL DEFAULT 0,
  "bank_value" DOUBLE PRECISION,
  "team_value" DOUBLE PRECISION,
  "points" INTEGER,
  "captain_provider_id" TEXT,
  "vice_captain_provider_id" TEXT,
  "chip_code" TEXT,
  "chip_status" TEXT,
  "transfers" JSONB,
  "source_snapshot_id" TEXT,
  "observed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fantasy_user_gameweek_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fantasy_user_gameweek_state_scope_key"
  ON "fantasy_user_gameweek_states" ("user_id", "contest_id", "gameweek");
CREATE INDEX "fantasy_user_gameweek_states_scope_idx"
  ON "fantasy_user_gameweek_states" ("provider", "league_id", "season", "gameweek");

CREATE TABLE "fantasy_chip_definitions" (
  "id" TEXT NOT NULL,
  "contest_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "half" TEXT NOT NULL,
  "max_uses" INTEGER NOT NULL DEFAULT 1,
  "rules" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fantasy_chip_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fantasy_chip_definitions_contest_code_half_key"
  ON "fantasy_chip_definitions" ("contest_id", "code", "half");
CREATE INDEX "fantasy_chip_definitions_provider_season_code_idx"
  ON "fantasy_chip_definitions" ("provider", "season", "code");

CREATE TABLE "fantasy_chip_usages" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "contest_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "gameweek" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "source" TEXT NOT NULL DEFAULT 'USER',
  "observed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fantasy_chip_usages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fantasy_chip_usages_user_contest_gameweek_key"
  ON "fantasy_chip_usages" ("user_id", "contest_id", "gameweek");
CREATE INDEX "fantasy_chip_usages_provider_season_code_status_idx"
  ON "fantasy_chip_usages" ("provider", "season", "code", "status");

CREATE TABLE "fantasy_provider_player_match_scores" (
  "id" TEXT NOT NULL,
  "contest_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "provider_player_id" TEXT NOT NULL,
  "gameweek" INTEGER NOT NULL,
  "league_id" BIGINT NOT NULL,
  "season" TEXT NOT NULL,
  "player_id" BIGINT,
  "match_id" BIGINT,
  "points" INTEGER NOT NULL,
  "breakdown" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OFFICIAL',
  "source_url" TEXT,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fantasy_provider_player_match_scores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fantasy_provider_player_match_score_key"
  ON "fantasy_provider_player_match_scores" ("contest_id", "provider_event_id", "provider_player_id");
CREATE INDEX "fantasy_provider_player_match_scores_scope_idx"
  ON "fantasy_provider_player_match_scores" ("provider", "league_id", "season", "gameweek");
CREATE INDEX "fantasy_provider_player_match_scores_player_idx"
  ON "fantasy_provider_player_match_scores" ("player_id", "season", "gameweek");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_player_price_snapshots_contest_id_fkey') THEN
    ALTER TABLE "fantasy_player_price_snapshots" ADD CONSTRAINT "fantasy_player_price_snapshots_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_player_price_snapshots_league_id_fkey') THEN
    ALTER TABLE "fantasy_player_price_snapshots" ADD CONSTRAINT "fantasy_player_price_snapshots_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_provider_sync_runs_contest_id_fkey') THEN
    ALTER TABLE "fantasy_provider_sync_runs" ADD CONSTRAINT "fantasy_provider_sync_runs_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_provider_sync_runs_league_id_fkey') THEN
    ALTER TABLE "fantasy_provider_sync_runs" ADD CONSTRAINT "fantasy_provider_sync_runs_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_provider_squad_snapshots_user_id_fkey') THEN
    ALTER TABLE "fantasy_provider_squad_snapshots" ADD CONSTRAINT "fantasy_provider_squad_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_provider_squad_snapshots_contest_id_fkey') THEN
    ALTER TABLE "fantasy_provider_squad_snapshots" ADD CONSTRAINT "fantasy_provider_squad_snapshots_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_provider_squad_snapshots_league_id_fkey') THEN
    ALTER TABLE "fantasy_provider_squad_snapshots" ADD CONSTRAINT "fantasy_provider_squad_snapshots_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_user_gameweek_states_user_id_fkey') THEN
    ALTER TABLE "fantasy_user_gameweek_states" ADD CONSTRAINT "fantasy_user_gameweek_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_user_gameweek_states_contest_id_fkey') THEN
    ALTER TABLE "fantasy_user_gameweek_states" ADD CONSTRAINT "fantasy_user_gameweek_states_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_user_gameweek_states_league_id_fkey') THEN
    ALTER TABLE "fantasy_user_gameweek_states" ADD CONSTRAINT "fantasy_user_gameweek_states_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_chip_definitions_contest_id_fkey') THEN
    ALTER TABLE "fantasy_chip_definitions" ADD CONSTRAINT "fantasy_chip_definitions_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_chip_usages_user_id_fkey') THEN
    ALTER TABLE "fantasy_chip_usages" ADD CONSTRAINT "fantasy_chip_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_chip_usages_contest_id_fkey') THEN
    ALTER TABLE "fantasy_chip_usages" ADD CONSTRAINT "fantasy_chip_usages_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_provider_player_match_scores_contest_id_fkey') THEN
    ALTER TABLE "fantasy_provider_player_match_scores" ADD CONSTRAINT "fantasy_provider_player_match_scores_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_provider_player_match_scores_league_id_fkey') THEN
    ALTER TABLE "fantasy_provider_player_match_scores" ADD CONSTRAINT "fantasy_provider_player_match_scores_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_provider_player_match_scores_player_id_fkey') THEN
    ALTER TABLE "fantasy_provider_player_match_scores" ADD CONSTRAINT "fantasy_provider_player_match_scores_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_provider_player_match_scores_match_id_fkey') THEN
    ALTER TABLE "fantasy_provider_player_match_scores" ADD CONSTRAINT "fantasy_provider_player_match_scores_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
