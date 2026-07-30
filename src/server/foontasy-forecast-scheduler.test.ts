import assert from "node:assert/strict";
import test from "node:test";

import { nextFoontasyRoundRun } from "@/server/foontasy-forecast-scheduler";

const fixture = (round: string, matchDate: string, finished = false) => ({
  round,
  matchDate: new Date(matchDate),
  finished,
  cancelled: false
});

test("Foontasy sync is scheduled ten hours before the first match of the active round", () => {
  const now = new Date("2026-07-30T08:34:00.000Z");
  const schedule = nextFoontasyRoundRun([
    fixture("2", "2026-07-31T17:00:00.000Z"),
    fixture("2", "2026-08-01T11:00:00.000Z"),
    fixture("3", "2026-08-08T12:30:00.000Z")
  ], [], now);

  assert.ok(schedule);
  assert.equal(schedule.roundNumber, 2);
  assert.equal(schedule.firstKickoffAt.toISOString(), "2026-07-31T17:00:00.000Z");
  assert.equal(schedule.dueAt.toISOString(), "2026-07-31T07:00:00.000Z");
  assert.equal(schedule.label, "2026-07-31 10:00 Europe/Moscow");
});

test("an early manual import does not cancel the scheduled ten-hour refresh", () => {
  const now = new Date("2026-07-30T08:34:00.000Z");
  const schedule = nextFoontasyRoundRun([
    fixture("2", "2026-07-31T17:00:00.000Z"),
    fixture("3", "2026-08-08T12:30:00.000Z")
  ], [{ roundNumber: 2, fetchedAt: new Date("2026-07-30T08:30:00.000Z") }], now);

  assert.ok(schedule);
  assert.equal(schedule.roundNumber, 2);
  assert.equal(schedule.dueAt.toISOString(), "2026-07-31T07:00:00.000Z");
});

test("a round fetched at the cutoff is complete and the next active round is selected", () => {
  const now = new Date("2026-08-01T08:00:00.000Z");
  const schedule = nextFoontasyRoundRun([
    fixture("2 тур", "2026-07-31T17:00:00.000Z"),
    fixture("3", "2026-08-08T12:30:00.000Z")
  ], [{ roundNumber: 2, fetchedAt: new Date("2026-07-31T07:00:00.000Z") }], now);

  assert.ok(schedule);
  assert.equal(schedule.roundNumber, 3);
  assert.equal(schedule.dueAt.toISOString(), "2026-08-08T02:30:00.000Z");
  assert.equal(schedule.label, "2026-08-08 05:30 Europe/Moscow");
});

test("an overdue active round is synchronized immediately and finished rounds are ignored", () => {
  const now = new Date("2026-07-31T09:00:00.000Z");
  const schedule = nextFoontasyRoundRun([
    fixture("1", "2026-07-24T17:00:00.000Z", true),
    fixture("2", "2026-07-31T17:00:00.000Z")
  ], [], now);

  assert.ok(schedule);
  assert.equal(schedule.roundNumber, 2);
  assert.equal(schedule.delayMs, 0);
});
