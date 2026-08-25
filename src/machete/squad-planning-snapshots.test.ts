import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SQUAD_PLANNING_SNAPSHOT_LEAD_MS,
  groupSquadPlanningProviderRounds,
  groupSquadPlanningRounds,
  isCapturableSquadPlanningSnapshot,
  squadPlanningCaptureDeadline,
  squadPlanningRoundKey
} from "./squad_planning_snapshots";
import type { SquadPlanningScheduleMatch } from "./squad_planning_snapshots";

const instrumentationSource = readFileSync(new URL("../instrumentation.ts", import.meta.url), "utf8");

test("Squad planning snapshot scheduler starts with the server", () => {
  assert.match(instrumentationSource, /startSquadPlanningSnapshotScheduler/);
});

function match(overrides: Partial<SquadPlanningScheduleMatch> = {}): SquadPlanningScheduleMatch {
  return {
    id: 1n,
    round: "5",
    matchDate: new Date("2026-09-20T16:00:00.000Z"),
    cancelled: false,
    finished: false,
    ...overrides
  };
}

test("Squad planning rounds are grouped by normalized tour label with the earliest kickoff", () => {
  const now = new Date("2026-09-01T00:00:00.000Z");
  const groups = groupSquadPlanningRounds(
    63n,
    "2026/2027",
    [
      match({ id: 10n, round: "Tour 5", matchDate: new Date("2026-09-20T18:00:00.000Z") }),
      match({ id: 11n, round: "tour 5", matchDate: new Date("2026-09-19T14:00:00.000Z") }),
      match({ id: 12n, round: " Tour 6 ", matchDate: new Date("2026-09-27T16:00:00.000Z") }),
      match({ id: 13n, round: "Tour 7", matchDate: null }),
      match({ id: 14n, round: "Tour 8", matchDate: new Date("2026-09-28T16:00:00.000Z"), cancelled: true })
    ],
    now
  );

  assert.equal(groups.length, 2);
  const tourFive = groups.find((group) => group.roundLabel === "Tour 5");
  assert.ok(tourFive);
  assert.equal(tourFive.roundKey, "round:tour 5");
  assert.equal(tourFive.firstKickoffAt.toISOString(), "2026-09-19T14:00:00.000Z");
  assert.deepEqual(tourFive.matchIds.map(String), ["10", "11"]);
});

test("Fully finished tours are not scheduled again, unfinished ones stay capturable", () => {
  const now = new Date("2026-09-01T00:00:00.000Z");
  const finishedOutsideGrace = groupSquadPlanningRounds(
    63n,
    "2026/2027",
    [match({ id: 20n, round: "1", matchDate: new Date("2026-08-30T16:00:00.000Z"), finished: true })],
    now
  );
  assert.equal(finishedOutsideGrace.length, 0);

  const allFinishedInsideGrace = groupSquadPlanningRounds(
    63n,
    "2026/2027",
    [
      match({ id: 21n, round: "2", matchDate: new Date("2026-08-31T23:50:00.000Z"), finished: true }),
      match({ id: 22n, round: "2", matchDate: new Date("2026-08-31T23:55:00.000Z"), finished: true })
    ],
    now
  );
  assert.equal(allFinishedInsideGrace.length, 0);

  const partiallyFinished = groupSquadPlanningRounds(
    63n,
    "2026/2027",
    [
      match({ id: 23n, round: "3", matchDate: new Date("2026-08-31T23:50:00.000Z"), finished: true }),
      match({ id: 24n, round: "3", matchDate: new Date("2026-08-31T23:58:00.000Z"), finished: false })
    ],
    now
  );
  assert.equal(partiallyFinished.length, 1);
  assert.equal(partiallyFinished[0].roundKey, "round:3");
});

test("Snapshot dueAt lands exactly one minute before the first kickoff", () => {
  const kickoff = new Date("2026-09-20T16:00:00.000Z");
  const groups = groupSquadPlanningRounds(63n, "2026/2027", [match()], new Date("2026-09-01T00:00:00.000Z"));
  assert.equal(SQUAD_PLANNING_SNAPSHOT_LEAD_MS, 60_000);
  assert.equal(groups[0].firstKickoffAt.toISOString(), kickoff.toISOString());
  assert.equal(groups[0].firstKickoffAt.getTime() - SQUAD_PLANNING_SNAPSHOT_LEAD_MS, kickoff.getTime() - 60_000);
});

test("Only due pending snapshots inside their attempt window are captured", () => {
  const now = new Date("2026-09-20T15:59:30.000Z");
  const kickoff = new Date("2026-09-20T16:00:00.000Z");
  const dueAt = new Date(kickoff.getTime() - SQUAD_PLANNING_SNAPSHOT_LEAD_MS);

  assert.equal(
    isCapturableSquadPlanningSnapshot({ status: "PENDING", dueAt, firstKickoffAt: kickoff, nextAttemptAt: null }, now),
    true
  );
  assert.equal(
    isCapturableSquadPlanningSnapshot({ status: "READY", dueAt, firstKickoffAt: kickoff, nextAttemptAt: null }, now),
    false
  );
  assert.equal(
    isCapturableSquadPlanningSnapshot(
      { status: "PENDING", dueAt, firstKickoffAt: kickoff, nextAttemptAt: new Date(now.getTime() + 10_000) },
      now
    ),
    false
  );

  const beforeDue = new Date(dueAt.getTime() - 1_000);
  assert.equal(
    isCapturableSquadPlanningSnapshot({ status: "PENDING", dueAt, firstKickoffAt: kickoff, nextAttemptAt: null }, beforeDue),
    false
  );

  assert.equal(squadPlanningCaptureDeadline(kickoff), kickoff.getTime() + 15 * 60 * 1_000);
});

test("Matches without a tour label fall back to a stable per-match key", () => {
  assert.equal(squadPlanningRoundKey(null, 42n), "match:42");
  assert.equal(squadPlanningRoundKey("  "), "round:unknown");
  assert.equal(squadPlanningRoundKey("Round 12"), "round:round 12");
});

test("Provider tours use the first non-cancelled fixture kickoff and canonical round keys", () => {
  const groups = groupSquadPlanningProviderRounds("SPORTS_RU", [
    {
      providerRoundId: "t-7",
      ordinal: 7,
      name: "Тур 7",
      startsAt: new Date("2026-10-01T00:00:00.000Z"),
      fixtures: [
        { kickoffAt: new Date("2026-09-26T16:00:00.000Z"), status: "SCHEDULED" },
        { kickoffAt: new Date("2026-09-25T17:30:00.000Z"), status: "CANCELLED" },
        { kickoffAt: new Date("2026-09-27T14:00:00.000Z"), status: null }
      ]
    },
    {
      providerRoundId: "t-8",
      ordinal: 8,
      name: "Тур 8",
      startsAt: new Date("2026-10-04T00:00:00.000Z"),
      fixtures: []
    }
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].roundKey, "sports-ru:tour:7:t-7");
  assert.equal(groups[0].firstKickoffAt.toISOString(), "2026-09-26T16:00:00.000Z");
  // Tours without usable fixture kickoffs fall back to the tour start date.
  assert.equal(groups[1].firstKickoffAt.toISOString(), "2026-10-04T00:00:00.000Z");
});
