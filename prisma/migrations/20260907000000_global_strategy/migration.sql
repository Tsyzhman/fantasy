-- @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data
CREATE TABLE "global_contest_strategy_states" (
 "id" TEXT PRIMARY KEY, "provider" TEXT NOT NULL, "contest_id" TEXT NOT NULL REFERENCES "sports_ru_fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "season" TEXT NOT NULL, "source_revision" TEXT NOT NULL, "calendar_revision" TEXT NOT NULL, "standings_round_id" TEXT NOT NULL,
 "field_size" INTEGER NOT NULL, "leader_points" DOUBLE PRECISION NOT NULL, "total_rounds" INTEGER NOT NULL, "remaining_rounds" INTEGER NOT NULL,
 "observed_at" TIMESTAMP(3) NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "global_contest_strategy_states_provider_contest_id_season_key" ON "global_contest_strategy_states"("provider", "contest_id", "season");
CREATE TABLE "user_global_strategy_states" (
 "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "provider" TEXT NOT NULL, "contest_id" TEXT NOT NULL REFERENCES "sports_ru_fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "provider_squad_id" TEXT NOT NULL, "season" TEXT NOT NULL, "source_revision" TEXT NOT NULL, "context_revision" TEXT NOT NULL,
 "rank" INTEGER NOT NULL, "manager_points" DOUBLE PRECISION NOT NULL, "history" JSONB NOT NULL,
 "observed_at" TIMESTAMP(3) NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "user_global_strategy_states_user_id_contest_id_provider_squ_key" ON "user_global_strategy_states"("user_id", "contest_id", "provider_squad_id", "season");
CREATE TABLE "global_strategy_recommendations" (
 "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "contest_id" TEXT NOT NULL REFERENCES "sports_ru_fantasy_contests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "squad_id" TEXT NOT NULL, "decision_round" TEXT NOT NULL, "input_hash" TEXT NOT NULL, "config_version" TEXT NOT NULL,
 "result" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "global_strategy_recommendation_input_key" ON "global_strategy_recommendations"("user_id", "squad_id", "decision_round", "input_hash", "config_version");
CREATE INDEX "global_strategy_recommendations_created_at_idx" ON "global_strategy_recommendations"("created_at");
