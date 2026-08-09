import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertFoontasyMappingReadiness,
  assertFoontasyProviderOverlap,
  parseFoontasyForecastPage,
  parseFoontasyRound,
  resolveFoontasySportsRound,
  responseCookieHeader
} from "@/machete/foontasy_forecasts";

test("Foontasy source expansion keeps the previous writer and rollback image compatible", () => {
  const root = process.cwd();
  const migration = readFileSync(path.join(root, "prisma/migrations/000029_foontasy_source_variants/migration.sql"), "utf8");
  const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  const importer = readFileSync(path.join(root, "src/machete/foontasy_forecasts.ts"), "utf8");

  assert.doesNotMatch(migration, /DROP INDEX/);
  assert.doesNotMatch(migration, /CREATE UNIQUE INDEX "foontasy_(?:forecasts|forecast_samples)_source_round_player_key"/);
  assert.match(schema, /@@unique\(\[leagueId, season, roundNumber, sourcePlayerId\]/);
  assert.doesNotMatch(schema, /@@unique\(\[leagueId, season, sourceVariant, sourceSeasonId, sourceRoundNumber, sourcePlayerId\]/);
  assert.match(importer, /leagueId_season_roundNumber_sourcePlayerId/);
  assert.doesNotMatch(importer, /leagueId_season_sourceVariant_sourceSeasonId_sourceRoundNumber_sourcePlayerId/);
});

test("Foontasy round parser recognizes the Russian tour heading without source-encoding ambiguity", () => {
  assert.equal(parseFoontasyRound("<h3>3 тур</h3>"), 3);
});

test("new Foontasy session cookies replace pre-login values", () => {
  const signin = new Response(null, { headers: { "set-cookie": "session=old; Path=/" } });
  const login = new Response(null, { headers: { "set-cookie": "session=new; Path=/" } });
  assert.equal(responseCookieHeader(signin, login), "session=new");
});

test("Foontasy parser rejects a structurally populated but uncalculated all-zero draft", () => {
  const rows = Array.from({ length: 150 }, (_, index) => foontasyRow(index, 0));
  assert.throws(() => parseFoontasyForecastPage(foontasyHtml(rows)), /only 0 calculated forecast rows/);
});

test("Foontasy parser requires at least 100 calculated player forecasts", () => {
  const rows = Array.from({ length: 150 }, (_, index) => foontasyRow(index, index < 100 ? 1 : 0));
  assert.equal(parseFoontasyForecastPage(foontasyHtml(rows)).length, 150);
  rows[99]!.points = 0;
  assert.throws(() => parseFoontasyForecastPage(foontasyHtml(rows)), /only 99 calculated forecast rows/);
});

test("Foontasy cup gate accepts a calculated final-sized squad pool but still rejects all-zero rows", () => {
  const finalRows = Array.from({ length: 50 }, (_, index) => foontasyRow(index, index < 40 ? 1 : 0));
  assert.equal(parseFoontasyForecastPage(foontasyHtml(finalRows), 42n).length, 50);
  assert.throws(
    () => parseFoontasyForecastPage(foontasyHtml(finalRows.map((row) => ({ ...row, points: 0 }))), 42n),
    /only 0 calculated forecast rows/
  );
  assert.doesNotThrow(() => assertFoontasyProviderOverlap(45, 50, 42n));
  assert.doesNotThrow(() => assertFoontasyMappingReadiness(45, 50, 42n));
});

test("Foontasy round parser understands domestic ordinals and cup stages", () => {
  assert.equal(parseFoontasyRound("<h3>1-й тур</h3>"), 1);
  assert.equal(parseFoontasyRound("<h3>1/16 финала</h3>", 77n), 4);
  assert.equal(parseFoontasyRound("<h3>Полуфинал</h3>", 77n), 7);
  assert.equal(parseFoontasyRound("<h3>1/16 первые матчи</h3>", 42n), 1);
  assert.equal(parseFoontasyRound("<h3>1/16 ответные матчи</h3>", 42n), 2);
  assert.equal(parseFoontasyRound("<h3>1/8 первые матчи</h3>", 73n), 3);
  assert.equal(parseFoontasyRound("<h3>1/8 ответные матчи</h3>", 73n), 4);
  assert.equal(parseFoontasyRound("<h3>1/4 ответные матчи</h3>", 42n), 6);
  assert.equal(parseFoontasyRound("<h3>Финал</h3>", 73n), 9);
});

test("Foontasy import gates reject the wrong provider phase and an unmapped player universe", () => {
  assert.doesNotThrow(() => assertFoontasyProviderOverlap(100, 110));
  assert.throws(() => assertFoontasyProviderOverlap(100, 120), /do not match the current Sports.ru phase/);
  assert.throws(() => assertFoontasyMappingReadiness(99, 500), /player mapping is not ready/);
  assert.throws(() => assertFoontasyMappingReadiness(100, 500), /player mapping is not ready/);
});

test("Foontasy cup rounds keep the Sports phase ID and continue canonical numbering", () => {
  const rules = {
    sportsRuSeasonId: "72",
    sportsRuSeasons: [
      { seasonId: "70", canonicalOffset: 0, tours: Array.from({ length: 8 }, (_, index) => ({ id: `g${index + 1}`, name: `${index + 1} тур` })) },
      { seasonId: "72", canonicalOffset: 8, tours: [
        "1 тур", "2 тур", "3 тур", "4 тур", "1/4 первые матчи", "1/4 ответные матчи",
        "Полуфинал первые матчи", "Полуфинал ответные матчи", "Финал"
      ].map((name, index) => ({ id: `p${index + 1}`, name })) }
    ]
  };

  assert.deepEqual(resolveFoontasySportsRound(rules, {
    leagueId: 42n,
    season: "2026/2027",
    sourceVariant: "sports",
    sourceRoundLabel: "1/4 ответные матчи",
    sourceRoundNumber: 6
  }), { sourceSeasonId: "72", sourceRoundNumber: 6, roundNumber: 14 });

  assert.deepEqual(resolveFoontasySportsRound(rules, {
    leagueId: 42n,
    season: "2026/2027",
    sourceVariant: "uefa",
    sourceRoundLabel: "9 тур",
    sourceRoundNumber: 9
  }), { sourceSeasonId: "72", sourceRoundNumber: 1, roundNumber: 9 });
  assert.deepEqual(resolveFoontasySportsRound(rules, {
    leagueId: 42n,
    season: "2026/2027",
    sourceVariant: "uefa",
    sourceRoundLabel: "17 тур",
    sourceRoundNumber: 17
  }), { sourceSeasonId: "72", sourceRoundNumber: 9, roundNumber: 17 });
});

function foontasyRow(index: number, points: number) {
  return {
    id: index,
    external_id: String(10_000 + index),
    name: `Player ${index}`,
    team_name: `Team ${index % 20}`,
    role: index % 4,
    points,
    attacking_points: 0,
    desc: ""
  };
}

function foontasyHtml(rows: ReturnType<typeof foontasyRow>[]) {
  return `<script>let data = ${JSON.stringify(rows)}; let filters = {};</script>`;
}
