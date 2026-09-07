-- AlterTable
ALTER TABLE "khl_seasons" ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "phase" TEXT NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "khl_contests" ADD COLUMN     "calendarComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "calendarObservedAt" TIMESTAMP(3),
ADD COLUMN     "catalogComplete" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "khl_player_match_stats" ADD COLUMN     "availableAt" TIMESTAMP(3),
ADD COLUMN     "blockedShots" INTEGER,
ADD COLUMN     "clubAtMatchId" TEXT,
ADD COLUMN     "observedAt" TIMESTAMP(3),
ADD COLUMN     "participationStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "shifts" INTEGER,
ADD COLUMN     "shotsOnGoal" INTEGER;

-- AlterTable
ALTER TABLE "khl_fantasy_players" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ownershipPct" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "khl_user_squads" ADD COLUMN     "baselineSnapshotId" TEXT;

ALTER TABLE "khl_seasons" ADD CONSTRAINT "khl_season_range" CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt");

-- CreateTable
CREATE TABLE "khl_external_entity_maps" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "providerScope" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "seasonId" TEXT,
    "contestId" TEXT,
    "weekId" TEXT,
    "teamId" TEXT,
    "playerId" TEXT,
    "matchId" TEXT,
    "evidence" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_external_entity_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_roster_memberships" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_roster_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_availability_observations" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "quality" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL,

    CONSTRAINT "khl_availability_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_xg_observations" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT,
    "teamId" TEXT,
    "metric" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "definitionVersion" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_xg_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_official_fantasy_scores" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "fantasyPlayerId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "points" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_official_fantasy_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_provider_squad_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "providerEntryId" TEXT NOT NULL,
    "providerWeekId" TEXT NOT NULL,
    "bankUnits" INTEGER NOT NULL,
    "transfersUsed" INTEGER,
    "entries" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "khl_provider_squad_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_forecast_revisions" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "horizonEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "diagnostics" JSONB NOT NULL,

    CONSTRAINT "khl_forecast_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_player_match_forecasts" (
    "id" TEXT NOT NULL,
    "forecastId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "expectedPoints" DOUBLE PRECISION,
    "participationProbability" DOUBLE PRECISION,
    "uncertainty" DOUBLE PRECISION,
    "components" JSONB NOT NULL,

    CONSTRAINT "khl_player_match_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_odds_event_maps" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "dictionaryVersion" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_odds_event_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_odds_snapshots" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "prices" JSONB NOT NULL,
    "probabilities" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_odds_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_source_contracts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "permissionStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "evidence" TEXT NOT NULL,
    "definitionVersion" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastSuccessAt" TIMESTAMP(3),
    "coverage" JSONB NOT NULL,

    CONSTRAINT "khl_source_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_provider_checkpoints" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "cursor" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_provider_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "khl_external_entity_maps_provider_entityType_providerScope__key" ON "khl_external_entity_maps"("provider", "entityType", "providerScope", "externalId");

-- CreateIndex
CREATE INDEX "khl_roster_memberships_seasonId_teamId_endsAt_idx" ON "khl_roster_memberships"("seasonId", "teamId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "khl_roster_memberships_seasonId_playerId_startsAt_key" ON "khl_roster_memberships"("seasonId", "playerId", "startsAt");

-- CreateIndex
CREATE INDEX "khl_availability_observations_playerId_observedAt_idx" ON "khl_availability_observations"("playerId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "khl_availability_observations_playerId_field_source_revisio_key" ON "khl_availability_observations"("playerId", "field", "source", "revision");

-- CreateIndex
CREATE INDEX "khl_xg_observations_playerId_matchId_availableAt_idx" ON "khl_xg_observations"("playerId", "matchId", "availableAt");

-- CreateIndex
CREATE INDEX "khl_xg_observations_teamId_matchId_availableAt_idx" ON "khl_xg_observations"("teamId", "matchId", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "khl_official_fantasy_scores_fantasyPlayerId_matchId_key" ON "khl_official_fantasy_scores"("fantasyPlayerId", "matchId");

-- CreateIndex
CREATE INDEX "khl_provider_squad_snapshots_userId_contestId_observedAt_idx" ON "khl_provider_squad_snapshots"("userId", "contestId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "khl_provider_squad_snapshots_userId_contestId_providerEntry_key" ON "khl_provider_squad_snapshots"("userId", "contestId", "providerEntryId", "hash");

-- CreateIndex
CREATE INDEX "khl_forecast_revisions_contestId_status_asOf_idx" ON "khl_forecast_revisions"("contestId", "status", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "khl_forecast_revisions_contestId_modelVersion_inputHash_key" ON "khl_forecast_revisions"("contestId", "modelVersion", "inputHash");

-- CreateIndex
CREATE UNIQUE INDEX "khl_player_match_forecasts_forecastId_playerId_matchId_key" ON "khl_player_match_forecasts"("forecastId", "playerId", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "khl_odds_event_maps_provider_externalId_key" ON "khl_odds_event_maps"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "khl_odds_snapshots_eventId_marketKey_revision_key" ON "khl_odds_snapshots"("eventId", "marketKey", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "khl_source_contracts_provider_key" ON "khl_source_contracts"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "khl_provider_checkpoints_provider_scope_jobType_key" ON "khl_provider_checkpoints"("provider", "scope", "jobType");

-- AddForeignKey
ALTER TABLE "khl_user_squads" ADD CONSTRAINT "khl_user_squads_baselineSnapshotId_fkey" FOREIGN KEY ("baselineSnapshotId") REFERENCES "khl_provider_squad_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_external_entity_maps" ADD CONSTRAINT "khl_external_entity_maps_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "khl_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_external_entity_maps" ADD CONSTRAINT "khl_external_entity_maps_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "khl_contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_external_entity_maps" ADD CONSTRAINT "khl_external_entity_maps_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "khl_fantasy_weeks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_external_entity_maps" ADD CONSTRAINT "khl_external_entity_maps_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "khl_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_external_entity_maps" ADD CONSTRAINT "khl_external_entity_maps_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "khl_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_external_entity_maps" ADD CONSTRAINT "khl_external_entity_maps_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "khl_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_roster_memberships" ADD CONSTRAINT "khl_roster_memberships_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "khl_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_roster_memberships" ADD CONSTRAINT "khl_roster_memberships_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "khl_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_roster_memberships" ADD CONSTRAINT "khl_roster_memberships_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "khl_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_availability_observations" ADD CONSTRAINT "khl_availability_observations_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "khl_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_xg_observations" ADD CONSTRAINT "khl_xg_observations_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "khl_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_xg_observations" ADD CONSTRAINT "khl_xg_observations_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "khl_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_xg_observations" ADD CONSTRAINT "khl_xg_observations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "khl_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_official_fantasy_scores" ADD CONSTRAINT "khl_official_fantasy_scores_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "khl_contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_official_fantasy_scores" ADD CONSTRAINT "khl_official_fantasy_scores_fantasyPlayerId_contestId_fkey" FOREIGN KEY ("fantasyPlayerId", "contestId") REFERENCES "khl_fantasy_players"("id", "contestId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_official_fantasy_scores" ADD CONSTRAINT "khl_official_fantasy_scores_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "khl_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_provider_squad_snapshots" ADD CONSTRAINT "khl_provider_squad_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_provider_squad_snapshots" ADD CONSTRAINT "khl_provider_squad_snapshots_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "khl_contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_forecast_revisions" ADD CONSTRAINT "khl_forecast_revisions_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "khl_contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_player_match_forecasts" ADD CONSTRAINT "khl_player_match_forecasts_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "khl_forecast_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_player_match_forecasts" ADD CONSTRAINT "khl_player_match_forecasts_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "khl_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_player_match_forecasts" ADD CONSTRAINT "khl_player_match_forecasts_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "khl_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_odds_event_maps" ADD CONSTRAINT "khl_odds_event_maps_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "khl_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_odds_snapshots" ADD CONSTRAINT "khl_odds_snapshots_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "khl_odds_event_maps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE khl_external_entity_maps ADD CONSTRAINT khl_mapping_single_target CHECK (
  num_nonnulls("seasonId", "contestId", "weekId", "teamId", "playerId", "matchId") = 1 AND
  CASE "entityType" WHEN 'season' THEN "seasonId" IS NOT NULL WHEN 'contest' THEN "contestId" IS NOT NULL WHEN 'week' THEN "weekId" IS NOT NULL WHEN 'team' THEN "teamId" IS NOT NULL WHEN 'player' THEN "playerId" IS NOT NULL WHEN 'match' THEN "matchId" IS NOT NULL ELSE false END
);
ALTER TABLE khl_roster_memberships ADD CONSTRAINT khl_membership_range CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE khl_xg_observations ADD CONSTRAINT khl_xg_values CHECK (num_nonnulls("playerId", "teamId") = 1 AND (value IS NULL OR value >= 0) AND "availableAt" <= "observedAt");
CREATE UNIQUE INDEX khl_xg_player_revision ON khl_xg_observations ("matchId", "playerId", metric, strength, source, "definitionVersion", revision) WHERE "playerId" IS NOT NULL;
CREATE UNIQUE INDEX khl_xg_team_revision ON khl_xg_observations ("matchId", "teamId", metric, strength, source, "definitionVersion", revision) WHERE "teamId" IS NOT NULL;
ALTER TABLE khl_provider_squad_snapshots ADD CONSTRAINT khl_provider_bank CHECK ("bankUnits" >= 0 AND ("transfersUsed" IS NULL OR "transfersUsed" BETWEEN 0 AND 5));
ALTER TABLE khl_player_match_forecasts ADD CONSTRAINT khl_forecast_probability CHECK ("participationProbability" IS NULL OR "participationProbability" BETWEEN 0 AND 1);
ALTER TABLE khl_availability_observations ADD CONSTRAINT khl_availability_quality CHECK (quality IN ('FACT', 'ESTIMATE', 'UNKNOWN') AND ("expiresAt" IS NULL OR "expiresAt" > "observedAt"));
