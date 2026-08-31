CREATE TABLE "fantasy_player_pool_snapshots" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
    "contest_id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "source_xi_revision" TEXT,
    "history_settings_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "players_count" INTEGER NOT NULL DEFAULT 0,
    "payload_hash" TEXT,
    "metadata" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fantasy_player_pool_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fantasy_player_pool_snapshot_players" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fantasy_player_pool_snapshot_players_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fantasy_player_pool_snapshots_scope_revision_key"
ON "fantasy_player_pool_snapshots"("provider", "contest_id", "variant", "revision");

CREATE INDEX "fantasy_player_pool_snapshots_ready_idx"
ON "fantasy_player_pool_snapshots"("provider", "contest_id", "variant", "status", "calculated_at");

CREATE INDEX "fantasy_player_pool_snapshots_scope_idx"
ON "fantasy_player_pool_snapshots"("league_id", "season", "calculated_at");

CREATE UNIQUE INDEX "fantasy_player_pool_snapshot_players_snapshot_player_key"
ON "fantasy_player_pool_snapshot_players"("snapshot_id", "player_id");

CREATE INDEX "fantasy_player_pool_snapshot_players_player_snapshot_idx"
ON "fantasy_player_pool_snapshot_players"("player_id", "snapshot_id");

ALTER TABLE "fantasy_player_pool_snapshots"
ADD CONSTRAINT "fantasy_player_pool_snapshots_contest_id_fkey"
FOREIGN KEY ("contest_id") REFERENCES "sports_ru_fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fantasy_player_pool_snapshots"
ADD CONSTRAINT "fantasy_player_pool_snapshots_league_id_fkey"
FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fantasy_player_pool_snapshot_players"
ADD CONSTRAINT "fantasy_player_pool_snapshot_players_snapshot_id_fkey"
FOREIGN KEY ("snapshot_id") REFERENCES "fantasy_player_pool_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
