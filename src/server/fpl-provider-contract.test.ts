import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../prisma/migrations/000032_fantasy_provider_isolation/migration.sql", import.meta.url), "utf8");
const scheduleMigration = readFileSync(new URL("../../prisma/migrations/000033_fantasy_provider_schedules/migration.sql", import.meta.url), "utf8");
const mergeScript = readFileSync(new URL("../../scripts/merge-core-leagues.ts", import.meta.url), "utf8");
const fplClient = readFileSync(new URL("../lib/providers/fpl.ts", import.meta.url), "utf8");
const fplPriceSync = readFileSync(new URL("./fpl-price-sync.ts", import.meta.url), "utf8");
const fplScoreSync = readFileSync(new URL("./fpl-official-score-sync.ts", import.meta.url), "utf8");
const fplImport = readFileSync(new URL("../machete/fpl-squad-import.ts", import.meta.url), "utf8");
const fplImportRoute = readFileSync(new URL("../app/api/machete/squads/import-fpl/route.ts", import.meta.url), "utf8");
const chipRoute = readFileSync(new URL("../app/api/machete/fpl/chips/route.ts", import.meta.url), "utf8");
const healthRoute = readFileSync(new URL("../app/api/health/fpl/route.ts", import.meta.url), "utf8");
const planner = readFileSync(new URL("../machete/squad_planner.ts", import.meta.url), "utf8");
const squadsRoute = readFileSync(new URL("../app/api/machete/squads/route.ts", import.meta.url), "utf8");
const fantasyRepositories = readFileSync(new URL("../machete/fantasy_repositories.ts", import.meta.url), "utf8");

test("FPL schema is provider/contest-scoped over the existing fantasy tables", () => {
  assert.match(schema, /model FantasyContest\s*\{/);
  assert.match(schema, /model FantasyPlayerPrice\s*\{[\s\S]*?contestId\s+String\s+@map\("contest_id"\)/);
  assert.match(schema, /model UserFantasySquad\s*\{[\s\S]*?contestId\s+String\s+@map\("contest_id"\)/);
  assert.match(schema, /model FantasyRuleset\s*\{[\s\S]*?provider\s+String/);
  assert.match(schema, /model FantasyRuleset\s*\{[\s\S]*?contestId\s+String\?/);
  assert.match(fantasyRepositories, /provider !== "CORE" && !input\.contestId/);
  for (const model of [
    "FantasyPlayerPriceSnapshot",
    "FantasyProviderSyncRun",
    "FantasyProviderSquadSnapshot",
    "FantasyUserGameweekState",
    "FantasyChipDefinition",
    "FantasyChipUsage",
    "FantasyProviderPlayerMatchScore",
    "FantasyProviderRound",
    "FantasyProviderFixture"
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
  }
});

test("provider schedule migration keeps provider rounds normalized and fixture identities unique", () => {
  assert.match(scheduleMigration, /CREATE TABLE "fantasy_provider_rounds"/);
  assert.match(scheduleMigration, /CREATE TABLE "fantasy_provider_fixtures"/);
  assert.match(scheduleMigration, /fantasy_provider_rounds_contest_provider_round_key/);
  assert.match(scheduleMigration, /fantasy_provider_fixtures_contest_fixture_key/);
  assert.match(scheduleMigration, /fantasy_provider_fixtures_contest_match_key/);
  assert.match(schema, /scheduleRevision\s+String\?/);
});

test("provider isolation migration backfills before enforcing contest keys", () => {
  assert.match(schema, /@@map\("sports_ru_fantasy_contests"\)/);
  assert.doesNotMatch(migration, /RENAME TO "fantasy_contests"/);
  assert.doesNotMatch(migration, /"fantasy_contests"/);
  assert.match(migration, /REFERENCES "sports_ru_fantasy_contests"\("id"\)/);
  assert.match(migration, /UPDATE "fantasy_player_prices" prices[\s\S]*contest_id/);
  assert.match(migration, /UPDATE "user_fantasy_squads" squads[\s\S]*contest_id/);
  assert.match(migration, /price rows without a contest remain/);
  assert.match(migration, /squads without a contest remain/);
  assert.match(migration, /fantasy_player_prices_contest_provider_player_id_key/);
  assert.match(migration, /fantasy_player_prices_contest_normalized_name_team_name_key/);
  assert.match(migration, /user_fantasy_squads_user_id_contest_id_name_key/);
  assert.match(migration, /CREATE TABLE "fantasy_provider_player_match_scores"/);
  assert.match(migration, /fantasy_rulesets_provider_contest_required/);
});

test("league merge preserves contest-bound FPL artifacts before source deletion", () => {
  assert.match(mergeScript, /mergeFantasyProviderArtifacts/);
  for (const table of [
    "fantasy_player_price_snapshots",
    "fantasy_provider_sync_runs",
    "fantasy_provider_squad_snapshots",
    "fantasy_user_gameweek_states",
    "fantasy_chip_definitions",
    "fantasy_chip_usages",
    "fantasy_provider_player_match_scores",
    "fantasy_provider_rounds",
    "fantasy_provider_fixtures"
  ]) {
    assert.match(mergeScript, new RegExp(table));
  }
});

test("FPL public sync is fail-closed and never mutates shared starter flags", () => {
  assert.match(fplClient, /credentials:\s*["']omit["']/);
  assert.match(fplClient, /FPL_BOOTSTRAP_URL/);
  assert.doesNotMatch(fplPriceSync, /teamPlayerSeason\.(update|upsert|create|createMany|updateMany|delete)/);
  assert.doesNotMatch(fplPriceSync, /isStarter\s*:/);
  assert.doesNotMatch(fplScoreSync, /teamPlayerSeason\.(update|upsert|create|createMany|updateMany|delete)/);
  assert.doesNotMatch(fplScoreSync, /isStarter\s*:/);
  assert.match(fplScoreSync, /fantasyProviderPlayerMatchScore/);
  assert.match(fplScoreSync, /FPL_EVENT_LIVE_URL/);
  assert.match(fplScoreSync, /latestFinalizedFplGameweek/);
  assert.match(fplPriceSync, /resolveFplMappings\(tx, contest\.id/);
  assert.match(fplPriceSync, /where: \{[\s\S]*contestId,[\s\S]*provider: FPL_PROVIDER/);
  assert.doesNotMatch(fplPriceSync, /coreLeague\.(create|upsert)/);
});

test("FPL imports use the public profile gate, contest scope, and chip ledger", () => {
  assert.match(fplImportRoute, /FPL_PROFILE_REQUIRED/);
  assert.match(fplImport, /getPublishedPicks/);
  assert.match(fplImport, /contestId/);
  assert.match(fplImport, /fantasyProviderSquadSnapshot/);
  assert.match(fplImport, /fantasyUserGameweekState/);
  assert.match(chipRoute, /validateFplChipUsage/);
  assert.match(chipRoute, /fantasyChipUsage/);
  assert.match(chipRoute, /fantasyUserGameweekState/);
});

test("FPL planner, API, and health checks retain provider in their scopes", () => {
  assert.match(planner, /provider.*league\.leagueId|provider.*leagueId/);
  assert.match(planner, /provider:/);
  assert.match(squadsRoute, /provider/);
  assert.match(healthRoute, /FPL_PROVIDER/);
  assert.match(healthRoute, /contestId/);
});
