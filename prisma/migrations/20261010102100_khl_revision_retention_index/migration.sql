-- @spec spec://modules/khl/INFRA-001-khl-data-ingestion#operations
CREATE INDEX CONCURRENTLY "khl_observation_revisions_observed_idx" ON khl_observation_revisions ("observedAt");
