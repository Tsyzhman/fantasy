-- @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations
SET lock_timeout = '5s';
SET statement_timeout = '30s';
ALTER TABLE khl_contests ADD COLUMN "catalogCheckedAt" TIMESTAMP(3);
ALTER TABLE khl_contests ADD COLUMN "catalogHash" TEXT;
