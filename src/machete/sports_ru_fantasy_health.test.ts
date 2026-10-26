import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSportsRuFantasyPriceHealth } from "./sports_ru_fantasy_health";

const scope = { leagueId: 47n, season: "2026/2027", tournamentHru: "england" };
const thresholds = { maximumAgeHours: 7, minimumPlayers: 100, minimumMappedPercent: 98 };
const now = new Date("2026-07-15T12:00:00.000Z");

test("only explicit reviewed exclusions leave the mapping denominator; missing mappings still fail", () => {
  const input = { scope, lastSyncedAt: now, priceCount: 110, mappedCount: 100, excludedCount: 10 };
  assert.equal(evaluateSportsRuFantasyPriceHealth(input, thresholds, now).healthy, true);
  assert.equal(evaluateSportsRuFantasyPriceHealth({ ...input, excludedCount: 0 }, thresholds, now).healthy, false);
  assert.equal(evaluateSportsRuFantasyPriceHealth({ ...input, excludedCount: 11 }, thresholds, now).healthy, false);
});

test("Sports.ru price health passes only a fresh, complete and mapped snapshot", () => {
  const result = evaluateSportsRuFantasyPriceHealth(
    { scope, lastSyncedAt: new Date("2026-07-15T06:00:00.000Z"), priceCount: 629, mappedCount: 620 },
    thresholds,
    now
  );

  assert.equal(result.healthy, true);
  assert.equal(result.ageHours, 6);
  assert.equal(result.mappedPercent, 98.569);
});

test("Sports.ru price health fails for stale, missing, sparse or weakly mapped data", () => {
  const inputs = [
    { lastSyncedAt: null, priceCount: 629, mappedCount: 629 },
    { lastSyncedAt: new Date("2026-07-15T04:59:59.000Z"), priceCount: 629, mappedCount: 629 },
    { lastSyncedAt: new Date("2026-07-15T11:00:00.000Z"), priceCount: 99, mappedCount: 99 },
    { lastSyncedAt: new Date("2026-07-15T11:00:00.000Z"), priceCount: 100, mappedCount: 97 },
    { lastSyncedAt: new Date("2026-07-15T13:00:00.000Z"), priceCount: 629, mappedCount: 629 }
  ];

  for (const input of inputs) {
    assert.equal(evaluateSportsRuFantasyPriceHealth({ scope, ...input }, thresholds, now).healthy, false);
  }
});
