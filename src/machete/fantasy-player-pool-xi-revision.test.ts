import assert from "node:assert/strict";
import test from "node:test";

import { buildFantasyStartingXiState, changedFantasyStartingXiTeams } from "./fantasy-player-pool-xi-revision";

const roster = [
  { teamId: 10n, playerId: 1n, isStarter: true },
  { teamId: 10n, playerId: 2n, isStarter: false },
  { teamId: 20n, playerId: 3n, isStarter: true },
  { teamId: 20n, playerId: 4n, isStarter: false },
  { teamId: 30n, playerId: 5n, isStarter: true }
];

test("XI vectors are independent of query order and repeated identical memberships", () => {
  const expected = buildFantasyStartingXiState(roster);
  assert.deepEqual(buildFantasyStartingXiState(roster.slice().reverse()), expected);
  assert.deepEqual(buildFantasyStartingXiState([...roster, roster[0]]), expected);
  assert.deepEqual(changedFantasyStartingXiTeams(expected.teamRevisions, expected.teamRevisions), []);
});

test("a flag edit changes only its team's revision, including removal of the last starter", () => {
  const before = buildFantasyStartingXiState(roster);
  const after = buildFantasyStartingXiState(roster.map((row) => row.playerId === 1n ? { ...row, isStarter: false } : row));
  assert.notEqual(before.revision, after.revision);
  assert.deepEqual(changedFantasyStartingXiTeams(before.teamRevisions, after.teamRevisions), [10n]);
});

test("a second team changed before queue pickup cannot disappear behind a global revision", () => {
  const before = buildFantasyStartingXiState(roster);
  const after = buildFantasyStartingXiState(roster.map((row) => row.teamId !== 30n ? { ...row, isStarter: !row.isStarter } : row));
  assert.deepEqual(changedFantasyStartingXiTeams(before.teamRevisions, after.teamRevisions), [10n, 20n]);
});

test("a nonstarter transfer refreshes both old and new teams even without changing starter IDs", () => {
  const before = buildFantasyStartingXiState(roster);
  const after = buildFantasyStartingXiState(roster.map((row) => row.playerId === 2n ? { ...row, teamId: 20n } : row));
  assert.deepEqual(changedFantasyStartingXiTeams(before.teamRevisions, after.teamRevisions), [10n, 20n]);
  const removedTeam = buildFantasyStartingXiState(roster.filter((row) => row.teamId !== 30n));
  assert.deepEqual(changedFantasyStartingXiTeams(before.teamRevisions, removedTeam.teamRevisions), [30n]);
});
