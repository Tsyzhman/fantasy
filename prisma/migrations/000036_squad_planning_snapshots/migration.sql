-- Point-in-time snapshots of the full Machete squad planning table,
-- captured one minute before the first kickoff of every tour so the
-- pre-deadline forecasts can later be compared with real fantasy results.

CREATE TABLE "squad_planning_snapshots" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "round_key" TEXT NOT NULL,
    "round_label" TEXT,
    "contest_id" TEXT,
    "first_kickoff_at" TIMESTAMP(3) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "captured_at" TIMESTAMP(3),
    "players_count" INTEGER NOT NULL DEFAULT 0,
    "payload_hash" TEXT,
    "players" JSONB,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "squad_planning_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "squad_planning_snapshots_scope_key"
ON "squad_planning_snapshots"("provider", "league_id", "season", "round_key");

CREATE INDEX "squad_planning_snapshots_status_due_idx"
ON "squad_planning_snapshots"("status", "due_at");

CREATE INDEX "squad_planning_snapshots_league_season_captured_idx"
ON "squad_planning_snapshots"("league_id", "season", "captured_at");

ALTER TABLE "squad_planning_snapshots" ADD CONSTRAINT "squad_planning_snapshots_contest_id_fkey"
FOREIGN KEY ("contest_id") REFERENCES "sports_ru_fantasy_contests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "squad_planning_snapshots" ADD CONSTRAINT "squad_planning_snapshots_league_id_fkey"
FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
