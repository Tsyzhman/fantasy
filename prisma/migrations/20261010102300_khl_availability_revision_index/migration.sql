-- @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations
CREATE INDEX CONCURRENTLY "khl_availability_revisions_retention_idx" ON khl_observation_revisions ("observedAt") WHERE "streamId" LIKE 'availability:%';
