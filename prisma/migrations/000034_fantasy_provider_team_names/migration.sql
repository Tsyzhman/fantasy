-- Preserve the provider-owned club labels even when a provider team has not
-- yet been mapped to a CoreTeam. This keeps partial schedules readable and
-- prevents a generic "Opponent" placeholder from leaking into the planner.

ALTER TABLE "fantasy_provider_fixtures"
  ADD COLUMN "provider_home_team_name" TEXT,
  ADD COLUMN "provider_away_team_name" TEXT;

UPDATE "fantasy_provider_fixtures" fixture
SET "provider_home_team_name" = team."name"
FROM "teams" team
WHERE fixture."home_team_id" = team."id";

UPDATE "fantasy_provider_fixtures" fixture
SET "provider_away_team_name" = team."name"
FROM "teams" team
WHERE fixture."away_team_id" = team."id";
