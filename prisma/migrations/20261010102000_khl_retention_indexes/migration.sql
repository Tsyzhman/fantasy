-- @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations
CREATE INDEX CONCURRENTLY "khl_sync_jobs_retention_idx" ON khl_sync_jobs (status, "updatedAt");
