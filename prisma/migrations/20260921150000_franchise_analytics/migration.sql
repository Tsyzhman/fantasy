-- @spec spec://modules/franchises/FEAT-005-franchise-analytics#data
CREATE TABLE "franchise_h2h_rounds" (
 "id" TEXT PRIMARY KEY, "season" TEXT NOT NULL, "slug" TEXT NOT NULL, "round" INTEGER NOT NULL,
 "payload" JSONB NOT NULL, "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "franchise_h2h_rounds_season_slug_round_key" UNIQUE ("season","slug","round")
);
CREATE TABLE "franchise_h2h_squads" (
 "id" TEXT PRIMARY KEY, "season" TEXT NOT NULL, "slug" TEXT NOT NULL, "round" INTEGER NOT NULL,
 "team" TEXT NOT NULL, "franchise" INTEGER NOT NULL, "manager" TEXT NOT NULL,
 "payload" JSONB NOT NULL, "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "franchise_h2h_squads_season_slug_round_team_key" UNIQUE ("season","slug","round","team")
);
CREATE INDEX "franchise_h2h_squads_season_franchise_round_idx" ON "franchise_h2h_squads"("season","franchise","round");
CREATE TABLE "franchise_h2h_states" (
 "id" TEXT PRIMARY KEY, "season" TEXT NOT NULL, "franchise" INTEGER NOT NULL,
 "payload" JSONB NOT NULL, "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "franchise_h2h_states_season_franchise_key" UNIQUE ("season","franchise")
);
CREATE TABLE "franchise_analytics_snapshots" (
 "season" TEXT PRIMARY KEY, "version" INTEGER NOT NULL, "payload" BYTEA NOT NULL,
 "sha256" TEXT NOT NULL, "generated_at" TIMESTAMP(3) NOT NULL, "squads" INTEGER NOT NULL
);
