-- Provider-owned fantasy rounds and fixture membership. CoreMatch.round stays
-- the league/FotMob round and is deliberately not reused for fantasy tours.

ALTER TABLE "sports_ru_fantasy_contests"
  ADD COLUMN "schedule_revision" TEXT,
  ADD COLUMN "schedule_synced_at" TIMESTAMP(3);

CREATE TABLE "fantasy_provider_rounds" (
  "id" TEXT NOT NULL,
  "contest_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_round_id" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT,
  "deadline_at" TIMESTAMP(3),
  "starts_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fantasy_provider_rounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fantasy_provider_fixtures" (
  "id" TEXT NOT NULL,
  "contest_id" TEXT NOT NULL,
  "round_id" TEXT,
  "provider" TEXT NOT NULL,
  "provider_fixture_id" TEXT NOT NULL,
  "provider_home_team_id" TEXT NOT NULL,
  "provider_away_team_id" TEXT NOT NULL,
  "home_team_id" BIGINT,
  "away_team_id" BIGINT,
  "match_id" BIGINT,
  "kickoff_at" TIMESTAMP(3),
  "status" TEXT,
  "source_round_label" TEXT,
  "mapping_status" TEXT NOT NULL DEFAULT 'UNMATCHED',
  "mapping_confidence" DOUBLE PRECISION,
  "matched_by" TEXT,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fantasy_provider_fixtures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fantasy_provider_rounds_contest_provider_round_key"
  ON "fantasy_provider_rounds"("contest_id", "provider_round_id");
CREATE UNIQUE INDEX "fantasy_provider_rounds_contest_ordinal_key"
  ON "fantasy_provider_rounds"("contest_id", "ordinal");
CREATE INDEX "fantasy_provider_rounds_contest_status_ordinal_idx"
  ON "fantasy_provider_rounds"("contest_id", "status", "ordinal");

CREATE UNIQUE INDEX "fantasy_provider_fixtures_contest_fixture_key"
  ON "fantasy_provider_fixtures"("contest_id", "provider_fixture_id");
CREATE UNIQUE INDEX "fantasy_provider_fixtures_contest_match_key"
  ON "fantasy_provider_fixtures"("contest_id", "match_id");
CREATE INDEX "fantasy_provider_fixtures_round_kickoff_idx"
  ON "fantasy_provider_fixtures"("round_id", "kickoff_at");
CREATE INDEX "fantasy_provider_fixtures_contest_mapping_idx"
  ON "fantasy_provider_fixtures"("contest_id", "mapping_status");

ALTER TABLE "fantasy_provider_rounds"
  ADD CONSTRAINT "fantasy_provider_rounds_contest_id_fkey"
  FOREIGN KEY ("contest_id") REFERENCES "sports_ru_fantasy_contests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fantasy_provider_fixtures"
  ADD CONSTRAINT "fantasy_provider_fixtures_contest_id_fkey"
  FOREIGN KEY ("contest_id") REFERENCES "sports_ru_fantasy_contests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fantasy_provider_fixtures"
  ADD CONSTRAINT "fantasy_provider_fixtures_round_id_fkey"
  FOREIGN KEY ("round_id") REFERENCES "fantasy_provider_rounds"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fantasy_provider_fixtures"
  ADD CONSTRAINT "fantasy_provider_fixtures_home_team_id_fkey"
  FOREIGN KEY ("home_team_id") REFERENCES "teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fantasy_provider_fixtures"
  ADD CONSTRAINT "fantasy_provider_fixtures_away_team_id_fkey"
  FOREIGN KEY ("away_team_id") REFERENCES "teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fantasy_provider_fixtures"
  ADD CONSTRAINT "fantasy_provider_fixtures_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep already published Sports.ru squad snapshots attached to the same
-- provider tour after planner/snapshot keys switch away from FotMob rounds.
-- tour_name is provider-owned; round_label was FotMob-owned and can differ.
WITH provider_snapshot_keys AS (
  SELECT
    snapshot."id",
    'sports-ru:tour:'
      || substring(snapshot."tour_name" from '[0-9]+')
      || ':' || snapshot."provider_tour_id" AS "new_round_key"
  FROM "sports_ru_squad_snapshots" snapshot
  WHERE snapshot."provider_tour_id" IS NOT NULL
    AND snapshot."tour_name" ~ '[0-9]+'
    AND snapshot."round_key" LIKE 'round:%'
)
UPDATE "sports_ru_squad_snapshots" snapshot
SET "round_key" = candidate."new_round_key"
FROM provider_snapshot_keys candidate
WHERE snapshot."id" = candidate."id"
  AND NOT EXISTS (
    SELECT 1
    FROM "sports_ru_squad_snapshots" existing
    WHERE existing."id" <> snapshot."id"
      AND existing."user_id" = snapshot."user_id"
      AND existing."provider_profile_id" = snapshot."provider_profile_id"
      AND existing."league_id" = snapshot."league_id"
      AND existing."season" = snapshot."season"
      AND existing."round_key" = candidate."new_round_key"
  );
