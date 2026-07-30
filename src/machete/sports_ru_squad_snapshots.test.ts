import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  latestStartedSportsRuSquadRound,
  SPORTS_RU_SQUAD_PUBLICATION_DELAY_MS,
  sportsRuTourMatchesFotMobRound
} from "./sports_ru_squad_snapshots";

const importRouteSource = readFileSync(new URL("../app/api/machete/squads/import-sports-ru/route.ts", import.meta.url), "utf8");

test("Sports.ru squad publication is scheduled 30 minutes after the first match of the latest started round", () => {
  const now = new Date("2026-07-30T17:00:00.000Z");
  const schedule = latestStartedSportsRuSquadRound([
    match(1n, "1", "2026-07-20T12:00:00.000Z"),
    match(2n, "1", "2026-07-20T15:00:00.000Z"),
    match(3n, "2", "2026-07-30T15:00:00.000Z"),
    match(4n, "2", "2026-07-30T16:00:00.000Z"),
    match(5n, "3", "2026-08-05T15:00:00.000Z")
  ], now);

  assert.ok(schedule);
  assert.equal(schedule.roundKey, "round:2");
  assert.equal(schedule.firstMatchAt.toISOString(), "2026-07-30T15:00:00.000Z");
  assert.equal(schedule.availableAfter.getTime() - schedule.firstMatchAt.getTime(), SPORTS_RU_SQUAD_PUBLICATION_DELAY_MS);
  assert.equal(schedule.availableAfter.toISOString(), "2026-07-30T15:30:00.000Z");
});

test("Sports.ru squad schedule ignores cancelled, future, and roundless fixtures", () => {
  const now = new Date("2026-07-30T17:00:00.000Z");
  const schedule = latestStartedSportsRuSquadRound([
    { ...match(1n, "1", "2026-07-30T15:00:00.000Z"), cancelled: true },
    match(2n, null, "2026-07-30T15:00:00.000Z"),
    match(3n, "2", "2026-07-31T15:00:00.000Z")
  ], now);

  assert.equal(schedule, null);
});

test("Sports.ru published tour must match the FotMob round when both expose a round number", () => {
  assert.equal(sportsRuTourMatchesFotMobRound("Regular Season - 1", "1 тур"), true);
  assert.equal(sportsRuTourMatchesFotMobRound("2", "Тур 1"), false);
  assert.equal(sportsRuTourMatchesFotMobRound("Final", "Final"), true);
});

test("the one-click import route reads only the stored snapshot and never requests Sports.ru", () => {
  assert.match(importRouteSource, /loadStoredSportsRuSquadImportPreview/);
  assert.doesNotMatch(importRouteSource, /fetchSportsRuLatestPublishedSquad|loadSportsRuSquadImportPreview/);
});

function match(id: bigint, round: string | null, matchDate: string) {
  return { id, round, matchDate: new Date(matchDate), cancelled: false };
}
