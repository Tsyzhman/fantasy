CREATE TABLE "fixture_odds_snapshots" (
    "id" TEXT NOT NULL,
    "match_id" BIGINT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "home_over_15_odds" DOUBLE PRECISION,
    "home_under_15_odds" DOUBLE PRECISION,
    "away_over_15_odds" DOUBLE PRECISION,
    "away_under_15_odds" DOUBLE PRECISION,
    "home_over_15_probability" DOUBLE PRECISION,
    "away_over_15_probability" DOUBLE PRECISION,
    "home_clean_sheet_probability" DOUBLE PRECISION,
    "away_clean_sheet_probability" DOUBLE PRECISION,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixture_odds_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fixture_odds_snapshots_match_id_provider_key"
ON "fixture_odds_snapshots"("match_id", "provider");

CREATE INDEX "fixture_odds_snapshots_provider_fetched_at_idx"
ON "fixture_odds_snapshots"("provider", "fetched_at");

CREATE INDEX "fixture_odds_snapshots_status_fetched_at_idx"
ON "fixture_odds_snapshots"("status", "fetched_at");

ALTER TABLE "fixture_odds_snapshots"
ADD CONSTRAINT "fixture_odds_snapshots_match_id_fkey"
FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
