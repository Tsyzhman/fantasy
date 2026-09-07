-- CreateTable
CREATE TABLE "khl_competitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "khl_competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_seasons" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "seasonKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "khl_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_contests" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
    "providerContestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "khl_contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_rulesets" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "rules" JSONB NOT NULL,
    "scoringBoundaryStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',

    CONSTRAINT "khl_rulesets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_fantasy_weeks" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "providerWeekId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "sourceUrl" TEXT NOT NULL,

    CONSTRAINT "khl_fantasy_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "khl_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_players" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),

    CONSTRAINT "khl_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_matches" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "awayId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "regulationScore" JSONB,
    "otScore" JSONB,
    "shootoutScore" JSONB,
    "finalScore" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "khl_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_match_fantasy_weeks" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,

    CONSTRAINT "khl_match_fantasy_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_player_match_stats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "toiSeconds" INTEGER,
    "ppToiSeconds" INTEGER,
    "pkToiSeconds" INTEGER,
    "saves" INTEGER,
    "goalsAgainst" INTEGER,
    "goals" INTEGER,
    "assists" INTEGER,
    "plusMinus" INTEGER,
    "pimMinutes" INTEGER,
    "started" BOOLEAN,
    "fullGame" BOOLEAN,
    "sources" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "khl_player_match_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_fantasy_players" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "providerPlayerId" TEXT NOT NULL,
    "providerTagId" TEXT,
    "playerId" TEXT,
    "name" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "currentPriceUnits" INTEGER,
    "priceDelta" INTEGER,
    "providerLock" BOOLEAN,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "priceRevision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "khl_fantasy_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_user_squads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LOCAL_DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "bankUnits" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_user_squads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_user_squad_entries" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "fantasyPlayerId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "keepForOptimizer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "khl_user_squad_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_user_view_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "viewKey" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "preferences" JSONB NOT NULL,

    CONSTRAINT "khl_user_view_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_revision_streams" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "hash" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_revision_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_observation_revisions" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3),

    CONSTRAINT "khl_observation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_observation_receipts" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_observation_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_sync_jobs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cursor" JSONB,
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khl_raw_payloads" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "compressed" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khl_raw_payloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "khl_competitions_code_key" ON "khl_competitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "khl_seasons_competitionId_seasonKey_key" ON "khl_seasons"("competitionId", "seasonKey");

-- CreateIndex
CREATE UNIQUE INDEX "khl_contests_provider_providerContestId_seasonId_key" ON "khl_contests"("provider", "providerContestId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "khl_rulesets_contestId_version_key" ON "khl_rulesets"("contestId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "khl_fantasy_weeks_contestId_providerWeekId_key" ON "khl_fantasy_weeks"("contestId", "providerWeekId");

-- CreateIndex
CREATE UNIQUE INDEX "khl_fantasy_weeks_id_contestId_key" ON "khl_fantasy_weeks"("id", "contestId");

-- CreateIndex
CREATE INDEX "khl_matches_seasonId_startsAt_status_idx" ON "khl_matches"("seasonId", "startsAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "khl_match_fantasy_weeks_contestId_matchId_key" ON "khl_match_fantasy_weeks"("contestId", "matchId");

-- CreateIndex
CREATE INDEX "khl_player_match_stats_playerId_matchId_idx" ON "khl_player_match_stats"("playerId", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "khl_player_match_stats_matchId_playerId_key" ON "khl_player_match_stats"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "khl_fantasy_players_contestId_position_id_idx" ON "khl_fantasy_players"("contestId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "khl_fantasy_players_contestId_providerPlayerId_key" ON "khl_fantasy_players"("contestId", "providerPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "khl_fantasy_players_contestId_playerId_key" ON "khl_fantasy_players"("contestId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "khl_fantasy_players_id_contestId_key" ON "khl_fantasy_players"("id", "contestId");

-- CreateIndex
CREATE INDEX "khl_user_squads_userId_contestId_updatedAt_idx" ON "khl_user_squads"("userId", "contestId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "khl_user_squads_userId_contestId_name_key" ON "khl_user_squads"("userId", "contestId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "khl_user_squads_id_contestId_key" ON "khl_user_squads"("id", "contestId");

-- CreateIndex
CREATE UNIQUE INDEX "khl_user_squad_entries_squadId_fantasyPlayerId_key" ON "khl_user_squad_entries"("squadId", "fantasyPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "khl_user_squad_entries_squadId_slotIndex_key" ON "khl_user_squad_entries"("squadId", "slotIndex");

-- CreateIndex
CREATE UNIQUE INDEX "khl_user_view_preferences_userId_contestId_viewKey_key" ON "khl_user_view_preferences"("userId", "contestId", "viewKey");

-- CreateIndex
CREATE INDEX "khl_observation_revisions_streamId_observedAt_idx" ON "khl_observation_revisions"("streamId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "khl_observation_revisions_streamId_sequence_key" ON "khl_observation_revisions"("streamId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "khl_observation_revisions_streamId_transitionKey_key" ON "khl_observation_revisions"("streamId", "transitionKey");

-- CreateIndex
CREATE INDEX "khl_observation_receipts_observedAt_idx" ON "khl_observation_receipts"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "khl_observation_receipts_streamId_transitionKey_key" ON "khl_observation_receipts"("streamId", "transitionKey");

-- CreateIndex
CREATE INDEX "khl_sync_jobs_status_nextRunAt_idx" ON "khl_sync_jobs"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "khl_raw_payloads_expiresAt_idx" ON "khl_raw_payloads"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "khl_raw_payloads_provider_scope_contentHash_key" ON "khl_raw_payloads"("provider", "scope", "contentHash");

-- AddForeignKey
ALTER TABLE "khl_seasons" ADD CONSTRAINT "khl_seasons_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "khl_competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_contests" ADD CONSTRAINT "khl_contests_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "khl_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_rulesets" ADD CONSTRAINT "khl_rulesets_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "khl_contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_fantasy_weeks" ADD CONSTRAINT "khl_fantasy_weeks_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "khl_contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_matches" ADD CONSTRAINT "khl_matches_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "khl_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_matches" ADD CONSTRAINT "khl_matches_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "khl_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_matches" ADD CONSTRAINT "khl_matches_awayId_fkey" FOREIGN KEY ("awayId") REFERENCES "khl_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_match_fantasy_weeks" ADD CONSTRAINT "khl_match_fantasy_weeks_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "khl_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_match_fantasy_weeks" ADD CONSTRAINT "khl_match_fantasy_weeks_weekId_contestId_fkey" FOREIGN KEY ("weekId", "contestId") REFERENCES "khl_fantasy_weeks"("id", "contestId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_player_match_stats" ADD CONSTRAINT "khl_player_match_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "khl_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_player_match_stats" ADD CONSTRAINT "khl_player_match_stats_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "khl_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_fantasy_players" ADD CONSTRAINT "khl_fantasy_players_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "khl_contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_fantasy_players" ADD CONSTRAINT "khl_fantasy_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "khl_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_user_squads" ADD CONSTRAINT "khl_user_squads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_user_squads" ADD CONSTRAINT "khl_user_squads_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "khl_contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_user_squad_entries" ADD CONSTRAINT "khl_user_squad_entries_squadId_contestId_fkey" FOREIGN KEY ("squadId", "contestId") REFERENCES "khl_user_squads"("id", "contestId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_user_squad_entries" ADD CONSTRAINT "khl_user_squad_entries_fantasyPlayerId_contestId_fkey" FOREIGN KEY ("fantasyPlayerId", "contestId") REFERENCES "khl_fantasy_players"("id", "contestId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_user_view_preferences" ADD CONSTRAINT "khl_user_view_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_user_view_preferences" ADD CONSTRAINT "khl_user_view_preferences_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "khl_contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_observation_revisions" ADD CONSTRAINT "khl_observation_revisions_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "khl_revision_streams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- @spec spec://modules/khl/INFRA-002-khl-storage-and-api#schema
CREATE UNIQUE INDEX khl_one_active_job ON khl_sync_jobs (provider, scope, "jobType") WHERE status IN ('PENDING', 'RUNNING');
ALTER TABLE khl_fantasy_players ADD CONSTRAINT khl_position CHECK (position IN ('G','D','F'));
ALTER TABLE khl_fantasy_players ADD CONSTRAINT khl_price_nonnegative CHECK ("currentPriceUnits" IS NULL OR "currentPriceUnits" >= 0);
ALTER TABLE khl_user_squad_entries ADD CONSTRAINT khl_slot_range CHECK ("slotIndex" BETWEEN 0 AND 16);
ALTER TABLE khl_user_squads ADD CONSTRAINT khl_bank_nonnegative CHECK ("bankUnits" IS NULL OR "bankUnits" >= 0);
ALTER TABLE khl_fantasy_weeks ADD CONSTRAINT khl_week_interval CHECK (("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt") AND (NOT verified OR ("startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND timezone IS NOT NULL)));
ALTER TABLE khl_player_match_stats ADD CONSTRAINT khl_stat_time_nonnegative CHECK (("toiSeconds" IS NULL OR "toiSeconds" >= 0) AND ("ppToiSeconds" IS NULL OR "ppToiSeconds" >= 0) AND ("pkToiSeconds" IS NULL OR "pkToiSeconds" >= 0) AND ("saves" IS NULL OR "saves" >= 0) AND ("goalsAgainst" IS NULL OR "goalsAgainst" >= 0));
ALTER TABLE khl_matches ADD CONSTRAINT khl_different_teams CHECK ("homeId" <> "awayId");

