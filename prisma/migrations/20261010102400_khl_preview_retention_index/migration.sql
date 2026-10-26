-- @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations
CREATE INDEX CONCURRENTLY "khl_previews_retention_idx" ON khl_transfer_scenarios ("expiresAt") WHERE status = 'PREVIEW';
