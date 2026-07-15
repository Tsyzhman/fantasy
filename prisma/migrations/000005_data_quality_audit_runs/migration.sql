CREATE TABLE "data_quality_audit_runs" (
  "id" TEXT NOT NULL,
  "league_id" BIGINT NOT NULL,
  "season" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "model_hash" TEXT NOT NULL,
  "coverage_threshold" DOUBLE PRECISION NOT NULL DEFAULT 98,
  "maximum_latency_hours" DOUBLE PRECISION NOT NULL DEFAULT 6,
  "active_players" INTEGER NOT NULL DEFAULT 0,
  "forecasts_available" INTEGER NOT NULL DEFAULT 0,
  "forecast_coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "players_with_basic_stats" INTEGER NOT NULL DEFAULT 0,
  "player_data_coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "finished_matches" INTEGER NOT NULL DEFAULT 0,
  "matches_with_player_stats" INTEGER NOT NULL DEFAULT 0,
  "match_data_coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "stat_rows" INTEGER NOT NULL DEFAULT 0,
  "complete_stat_rows" INTEGER NOT NULL DEFAULT 0,
  "stat_row_coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "matches_promoted_in_time" INTEGER NOT NULL DEFAULT 0,
  "promotion_latency_coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "gate_passed" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "report" JSONB,
  "error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "data_quality_audit_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_quality_audit_runs_league_id_season_created_at_idx"
  ON "data_quality_audit_runs"("league_id", "season", "created_at");

CREATE INDEX "data_quality_audit_runs_status_created_at_idx"
  ON "data_quality_audit_runs"("status", "created_at");

CREATE INDEX "data_quality_audit_runs_gate_passed_created_at_idx"
  ON "data_quality_audit_runs"("gate_passed", "created_at");
