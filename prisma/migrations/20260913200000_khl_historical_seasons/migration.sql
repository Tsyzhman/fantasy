-- @spec spec://modules/khl/INFRA-002-khl-storage-and-api#schema
CREATE TABLE "khl_historical_seasons" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "seasonKey" TEXT NOT NULL,
  "providerSeasonId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "aggregates" JSONB NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "khl_historical_seasons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "khl_historical_seasons_playerId_seasonKey_key" ON "khl_historical_seasons"("playerId", "seasonKey");
ALTER TABLE "khl_historical_seasons" ADD CONSTRAINT "khl_historical_seasons_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "khl_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
