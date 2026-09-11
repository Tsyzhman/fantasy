-- @spec spec://modules/khl/INFRA-002-khl-storage-and-api#protocol-aggregates
ALTER TABLE khl_player_match_stats ADD COLUMN "attackZoneSeconds" INTEGER;
ALTER TABLE khl_player_match_stats ADD CONSTRAINT khl_attack_time_nonnegative CHECK ("attackZoneSeconds" IS NULL OR "attackZoneSeconds" >= 0);
