import assert from "node:assert/strict";
import test from "node:test";

import {
  fixtureOddsSyncTriggers,
  nextFixtureOddsSyncAt,
  pendingFixtureOddsSyncTriggers,
  type FixtureOddsScheduleMatch
} from "./fixture-odds-scheduler";

const firstKickoff = new Date("2026-07-24T17:00:00.000Z");
const secondKickoff = new Date("2026-07-25T14:00:00.000Z");

test("fixture odds are scheduled daily for a week and finally three hours before the first match of a round", () => {
  const triggers = fixtureOddsSyncTriggers(roundMatches());
  assert.deepEqual(
    triggers.map((trigger) => [trigger.kind, trigger.dueAt.toISOString()]),
    [
      ["ROUND_DAILY", "2026-07-17T17:00:00.000Z"],
      ["ROUND_DAILY", "2026-07-18T17:00:00.000Z"],
      ["ROUND_DAILY", "2026-07-19T17:00:00.000Z"],
      ["ROUND_DAILY", "2026-07-20T17:00:00.000Z"],
      ["ROUND_DAILY", "2026-07-21T17:00:00.000Z"],
      ["ROUND_DAILY", "2026-07-22T17:00:00.000Z"],
      ["ROUND_DAILY", "2026-07-23T17:00:00.000Z"],
      ["ROUND_FINAL", "2026-07-24T14:00:00.000Z"]
    ]
  );
  assert.ok(triggers.every((trigger) => trigger.matchIds.map(String).join(",") === "1,2"));
});

test("a snapshot made before a trigger does not suppress the required later refresh", () => {
  const matches = roundMatches(new Date("2026-07-23T18:00:00.000Z"));
  const pending = pendingFixtureOddsSyncTriggers(matches);
  assert.deepEqual(pending.map((trigger) => trigger.kind), ["ROUND_FINAL"]);
});

test("a refresh after both triggers satisfies the round and match schedules", () => {
  const matches = roundMatches(new Date("2026-07-24T15:00:00.000Z"));
  assert.equal(pendingFixtureOddsSyncTriggers(matches).length, 0);
});

test("overdue unavailable lines retry later without hiding an earlier future trigger", () => {
  const now = new Date("2026-07-23T17:05:00.000Z");
  const retryAt = new Date("2026-07-23T17:35:00.000Z");
  const pending = pendingFixtureOddsSyncTriggers(roundMatches());
  assert.equal(nextFixtureOddsSyncAt(pending, now, retryAt)?.toISOString(), retryAt.toISOString());

  const futureSoon = [{ ...pending[1], dueAt: new Date("2026-07-23T17:20:00.000Z") }, pending[0]];
  assert.equal(nextFixtureOddsSyncAt(futureSoon, now, retryAt)?.toISOString(), "2026-07-23T17:20:00.000Z");
});

test("matches without a provider round use an independent week-long schedule", () => {
  const matches = roundMatches().map((match) => ({ ...match, round: null }));
  const triggers = fixtureOddsSyncTriggers(matches);
  assert.equal(triggers.length, 16);
  assert.equal(triggers.filter((trigger) => trigger.kind === "ROUND_DAILY").length, 14);
  assert.equal(triggers.filter((trigger) => trigger.kind === "ROUND_FINAL").length, 2);
});

function roundMatches(fetchedAt: Date | null = null): FixtureOddsScheduleMatch[] {
  return [
    {
      id: 1n, leagueId: 63n, season: "2026", round: "1", matchDate: firstKickoff,
      finished: false, oddsFetchedAt: fetchedAt
    },
    {
      id: 2n, leagueId: 63n, season: "2026", round: "1", matchDate: secondKickoff,
      finished: false, oddsFetchedAt: fetchedAt
    }
  ];
}
