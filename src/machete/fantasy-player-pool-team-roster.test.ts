import assert from "node:assert/strict";
import test from "node:test";

import { fantasyPlayerPoolTeamRefreshPlayerIds } from "./fantasy-player-pool-team-roster";

test("team refresh includes Sports.ru players missing from the active FotMob roster", () => {
  assert.deepEqual(fantasyPlayerPoolTeamRefreshPlayerIds(
    [10n],
    [{ playerId: 1n, teamId: 10n }],
    [{ playerId: 1n, teamId: 10n }, { playerId: 2n, teamId: 10n }, { playerId: 3n, teamId: 20n }]
  ), [1n, 2n]);
});

test("team refresh follows authoritative transfers and does not retain a player in the old team", () => {
  assert.deepEqual(fantasyPlayerPoolTeamRefreshPlayerIds(
    [10n],
    [{ playerId: 1n, teamId: 10n }, { playerId: 2n, teamId: 10n }],
    [{ playerId: 1n, teamId: 20n }]
  ), [2n]);
});

test("mass team refresh deduplicates overlapping roster sources", () => {
  assert.deepEqual(fantasyPlayerPoolTeamRefreshPlayerIds(
    [10n, 20n, 10n],
    [{ playerId: 1n, teamId: 10n }, { playerId: 2n, teamId: 20n }],
    [{ playerId: 1n, teamId: 10n }, { playerId: 2n, teamId: 20n }, { playerId: 3n, teamId: 20n }]
  ), [1n, 2n, 3n]);
});

test("a Sports.ru-only team is still recalculated when it has no FotMob memberships", () => {
  assert.deepEqual(fantasyPlayerPoolTeamRefreshPlayerIds([10n], [], [{ playerId: 1n, teamId: 10n }]), [1n]);
  assert.deepEqual(fantasyPlayerPoolTeamRefreshPlayerIds([], [], [{ playerId: 1n, teamId: 10n }]), []);
});
