import assert from "node:assert/strict";
import test from "node:test";

import {
  currentEuropeanSeason,
  fantasySourceScopeKey,
  foontasyScopeKey,
  loadFoontasySyncScopes,
  parseFoontasyScopeDefinitions,
  selectRequestedScopes
} from "./fantasy-source-sync-config";

test("Foontasy admin scopes accept only numeric league IDs and safe assistant slugs", () => {
  assert.deepEqual(
    parseFoontasyScopeDefinitions("63:rpl;57:eredivisie").map((scope) => [scope.leagueId, scope.sourceKey]),
    [[63n, "rpl"], [57n, "eredivisie"]]
  );
  assert.throws(() => parseFoontasyScopeDefinitions("63:https://evil.example"), /Invalid Foontasy sync scope/);
  assert.throws(() => parseFoontasyScopeDefinitions("63:rpl;63:rpl"), /Duplicate Foontasy sync scope/);
});

test("Foontasy catalog covers every national assistant and keeps cup variants distinct", () => {
  const scopes = parseFoontasyScopeDefinitions([
    "63:rpl", "47:epl", "87:la-liga", "54:bundesliga", "55:serie-a", "53:ligue-1",
    "57:eredivisie", "61:liga-nos", "71:super-lig", "48:championship",
    "42:champions-league-sports", "42:champions-league-uefa", "73:europa-league", "77:world-cup"
  ].join(";"));

  assert.equal(scopes.length, 14);
  assert.deepEqual(scopes.slice(0, 10).map((scope) => `${scope.leagueId}:${scope.assistantSlug}`), [
    "63:rpl", "47:epl", "87:la-liga", "54:bundesliga", "55:serie-a", "53:ligue-1",
    "57:eredivisie", "61:liga-nos", "71:super-lig", "48:championship"
  ]);
  assert.deepEqual(scopes[10], {
    leagueId: 42n,
    sourceKey: "champions-league-sports",
    labelEn: "Champions League (Sports.ru)",
    labelRu: "ЛЧ Sports",
    assistantSlug: "champions-league",
    sourceVariant: "sports",
    assistantQuery: undefined,
    requiresCurrentEuropeanSeason: true
  });
  assert.equal(scopes[11]?.sourceVariant, "uefa");
  assert.deepEqual(scopes[11]?.assistantQuery, { game: "uefa" });
});

test("current Foontasy scopes expose the exact UEFA query and hide stale European cup seasons", async () => {
  const seasons = [
    { leagueId: 42n, season: "2026/2027", updatedAt: new Date("2026-08-01") },
    { leagueId: 73n, season: "2025/2026", updatedAt: new Date("2026-08-01") }
  ];
  const prisma = { leagueSeason: { findMany: async () => seasons } } as never;
  const scopes = await loadFoontasySyncScopes(prisma, {}, new Date("2026-08-09T00:00:00Z"));

  assert.equal(scopes.length, 2);
  assert.equal(scopes[0]?.url, "https://foontasy.ru/assistant/champions-league");
  assert.equal(scopes[1]?.url, "https://foontasy.ru/assistant/champions-league?game=uefa");
  assert.notEqual(foontasyScopeKey(scopes[0]!), foontasyScopeKey(scopes[1]!));
  assert.equal(scopes.some((scope) => scope.leagueId === 73n), false);
  assert.equal(currentEuropeanSeason(new Date("2026-08-09T00:00:00Z")), "2026/2027");
});

test("admin requests cannot inject an unconfigured league scope", () => {
  const available = [
    { leagueId: 87n, season: "2026/2027", sourceKey: "spain" },
    { leagueId: 48n, season: "2026/2027", sourceKey: "championship" }
  ];
  const keyFor = (scope: typeof available[number]) => fantasySourceScopeKey(scope, scope.sourceKey);
  assert.deepEqual(selectRequestedScopes(available, [keyFor(available[1])], keyFor), [available[1]]);
  assert.throws(() => selectRequestedScopes(available, ["71:2026/2027:turkey"], keyFor), /Unsupported league scope/);
});
