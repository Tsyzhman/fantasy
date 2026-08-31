CREATE TABLE "fantasy_player_pool_refresh_requests" (
    "id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "team_id" BIGINT NOT NULL,
    "request_token" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fantasy_player_pool_refresh_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fantasy_player_pool_refresh_requests_scope_team_key"
ON "fantasy_player_pool_refresh_requests"("league_id", "season", "team_id");

CREATE INDEX "fantasy_player_pool_refresh_requests_available_idx"
ON "fantasy_player_pool_refresh_requests"("available_at");
