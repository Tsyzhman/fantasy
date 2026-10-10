-- @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations
CREATE INDEX CONCURRENTLY "khl_availability_expiry_idx" ON khl_availability_observations ("expiresAt");
