-- @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations
SET lock_timeout = '5s';
SET statement_timeout = '120s';
CREATE INDEX CONCURRENTLY "khl_sync_jobs_retention_idx" ON khl_sync_jobs (status, "updatedAt");
CREATE INDEX CONCURRENTLY "khl_observation_revisions_observed_idx" ON khl_observation_revisions ("observedAt");
CREATE INDEX CONCURRENTLY "khl_availability_expiry_idx" ON khl_availability_observations ("expiresAt");
CREATE INDEX CONCURRENTLY "khl_availability_revisions_retention_idx" ON khl_observation_revisions ("observedAt") WHERE "streamId" LIKE 'availability:%';
CREATE INDEX CONCURRENTLY "khl_previews_retention_idx" ON khl_transfer_scenarios ("expiresAt") WHERE status = 'PREVIEW';
