CREATE TABLE "sports_ru_squad_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "round_key" TEXT NOT NULL,
    "round_label" TEXT,
    "first_match_at" TIMESTAMP(3) NOT NULL,
    "available_after" TIMESTAMP(3) NOT NULL,
    "provider_profile_id" TEXT NOT NULL,
    "provider_season_id" TEXT NOT NULL,
    "provider_squad_id" TEXT,
    "provider_tour_id" TEXT,
    "squad_name" TEXT,
    "tournament_name" TEXT,
    "tour_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "sync_lease_until" TIMESTAMP(3),
    "players_count" INTEGER NOT NULL DEFAULT 0,
    "mapped_players_count" INTEGER NOT NULL DEFAULT 0,
    "selections" JSONB,
    "provider_payload" JSONB,
    "unmapped_players" JSONB,
    "fetched_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_ru_squad_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sports_ru_squad_snapshot_scope_key"
ON "sports_ru_squad_snapshots"("user_id", "provider_profile_id", "league_id", "season", "round_key");

CREATE INDEX "sports_ru_squad_snapshot_due_idx"
ON "sports_ru_squad_snapshots"("status", "available_after", "next_attempt_at");

CREATE INDEX "sports_ru_squad_snapshot_latest_idx"
ON "sports_ru_squad_snapshots"("user_id", "league_id", "season", "completed_at");

ALTER TABLE "sports_ru_squad_snapshots" ADD CONSTRAINT "sports_ru_squad_snapshots_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sports_ru_squad_snapshots" ADD CONSTRAINT "sports_ru_squad_snapshots_league_id_fkey"
FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
