import assert from "node:assert/strict";
import test from "node:test";

import { canonicalLeagueIdForIdentity, expandScopesWithAliases, parseLeagueAliases } from "./league-aliases";
import { createIngestionScope } from "./ingestion-scope";

test("canonical league matcher folds known split tournament names", () => {
  assert.equal(canonicalLeagueIdForIdentity({ id: 9001, name: "EURO Final Stage", country: "INT" }), 50);
  assert.equal(canonicalLeagueIdForIdentity({ id: 9002, name: "Championship Playoff", country: "England" }), 48);
  assert.equal(canonicalLeagueIdForIdentity({ id: 9003, name: "LaLiga 2 Playoff", country: "Spain" }), 140);
  assert.equal(canonicalLeagueIdForIdentity({ id: 9004, name: "League One Playoff", country: "England" }), 108);
  assert.equal(canonicalLeagueIdForIdentity({ id: 9005, name: "EFL Cup Qualification", country: "England" }), 133);
  assert.equal(canonicalLeagueIdForIdentity({ id: 9006, name: "Carabao Cup Qualifying", country: "England" }), 133);
});

test("league alias env parser supports compact target-source groups", () => {
  assert.deepEqual(parseLeagueAliases("42:9001,9002;50=9003;73->9004"), [
    { sourceLeagueId: 9001, canonicalLeagueId: 42 },
    { sourceLeagueId: 9002, canonicalLeagueId: 42 },
    { sourceLeagueId: 9003, canonicalLeagueId: 50 },
    { sourceLeagueId: 9004, canonicalLeagueId: 73 }
  ]);
});

test("alias expansion keeps canonical scope first and appends source scopes", () => {
  const scopes = [createIngestionScope({ league_id: 42, season: "2025/2026" })];

  assert.deepEqual(
    expandScopesWithAliases(scopes, [
      { sourceLeagueId: 9001, canonicalLeagueId: 42 },
      { sourceLeagueId: 9002, canonicalLeagueId: 50 }
    ]).map((scope) => [scope.league_id, scope.canonical_league_id, scope.season]),
    [
      [42, null, "2025/2026"],
      [9001, 42, "2025/2026"]
    ]
  );
});
