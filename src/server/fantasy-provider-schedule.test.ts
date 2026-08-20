import assert from "node:assert/strict";
import test from "node:test";

import {
  fantasyProviderScheduleRevision,
  validateFantasyProviderSchedule,
  type FantasyProviderFixtureInput,
  type FantasyProviderRoundInput
} from "./fantasy-provider-schedule";

const rounds: FantasyProviderRoundInput[] = [
  {
    providerRoundId: "1",
    ordinal: 1,
    name: "Gameweek 1",
    status: "FINISHED",
    deadlineAt: new Date("2026-08-14T17:30:00Z"),
    startsAt: new Date("2026-08-15T14:00:00Z"),
    finishedAt: new Date("2026-08-17T21:00:00Z")
  },
  {
    providerRoundId: "2",
    ordinal: 2,
    name: "Gameweek 2",
    status: "NEXT",
    deadlineAt: new Date("2026-08-21T17:30:00Z"),
    startsAt: new Date("2026-08-22T14:00:00Z"),
    finishedAt: null
  }
];

const fixtures: FantasyProviderFixtureInput[] = [
  {
    providerFixtureId: "100",
    providerRoundId: "1",
    providerHomeTeamId: "1",
    providerAwayTeamId: "2",
    kickoffAt: new Date("2026-08-15T14:00:00Z"),
    status: "FINISHED",
    sourceRoundLabel: null
  },
  {
    providerFixtureId: "101",
    providerRoundId: null,
    providerHomeTeamId: "3",
    providerAwayTeamId: "4",
    kickoffAt: null,
    status: "SCHEDULED",
    sourceRoundLabel: null
  }
];

test("provider schedule accepts an unassigned FPL fixture and rejects duplicate identities", () => {
  assert.doesNotThrow(() => validateFantasyProviderSchedule(rounds, fixtures));
  assert.throws(
    () => validateFantasyProviderSchedule(rounds, [...fixtures, fixtures[0]]),
    /duplicate fixture 100/
  );
  assert.throws(
    () => validateFantasyProviderSchedule([...rounds, { ...rounds[1], providerRoundId: "3" }], fixtures),
    /duplicate round ordinal 2/
  );
  assert.throws(
    () => validateFantasyProviderSchedule(rounds, [{ ...fixtures[0], providerRoundId: "99" }]),
    /references missing round 99/
  );
});

test("provider schedule revision is order-independent and changes when a fixture moves gameweek", () => {
  const teamIds = new Map([["1", 10n], ["2", 20n]]);
  const revision = fantasyProviderScheduleRevision("FPL", rounds, fixtures, teamIds);
  const reordered = fantasyProviderScheduleRevision("FPL", [...rounds].reverse(), [...fixtures].reverse(), new Map([...teamIds].reverse()));
  const reassigned = fantasyProviderScheduleRevision("FPL", rounds, fixtures.map((fixture) =>
    fixture.providerFixtureId === "101" ? { ...fixture, providerRoundId: "2" } : fixture
  ), teamIds);
  const remapped = fantasyProviderScheduleRevision("FPL", rounds, fixtures, new Map([["1", 11n], ["2", 20n]]));

  assert.equal(reordered, revision);
  assert.notEqual(reassigned, revision);
  assert.notEqual(remapped, revision);
  assert.match(revision, /^[a-f0-9]{64}$/);
});
