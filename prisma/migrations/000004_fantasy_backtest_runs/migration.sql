CREATE TABLE "fantasy_backtest_runs" (
  "id" TEXT NOT NULL,
  "league_id" BIGINT NOT NULL,
  "season" TEXT NOT NULL,
  "model_source" TEXT NOT NULL DEFAULT 'MACHETE',
  "model_name" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "model_hash" TEXT NOT NULL,
  "baseline" TEXT NOT NULL,
  "history_matches" INTEGER NOT NULL,
  "minimum_history" INTEGER NOT NULL,
  "expected_matches" INTEGER,
  "finished_matches" INTEGER NOT NULL,
  "season_complete" BOOLEAN NOT NULL DEFAULT false,
  "sample_size" INTEGER NOT NULL DEFAULT 0,
  "model_mae" DOUBLE PRECISION,
  "baseline_mae" DOUBLE PRECISION,
  "model_rmse" DOUBLE PRECISION,
  "baseline_rmse" DOUBLE PRECISION,
  "passing_positions" INTEGER NOT NULL DEFAULT 0,
  "gate_passed" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "configuration" JSONB NOT NULL,
  "report" JSONB,
  "error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "fantasy_backtest_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fantasy_backtest_runs_league_id_season_created_at_idx"
  ON "fantasy_backtest_runs"("league_id", "season", "created_at");

CREATE INDEX "fantasy_backtest_runs_model_hash_created_at_idx"
  ON "fantasy_backtest_runs"("model_hash", "created_at");

CREATE INDEX "fantasy_backtest_runs_status_created_at_idx"
  ON "fantasy_backtest_runs"("status", "created_at");
