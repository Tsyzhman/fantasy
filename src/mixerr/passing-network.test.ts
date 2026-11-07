/** @spec spec://modules/mixerr/FEAT-001-passing-networks#aggregation
 * @spec spec://modules/mixerr/FEAT-001-passing-networks#input
 */

import assert from "node:assert/strict";
import test from "node:test";

import { PassingFileError, readPassingNetworks } from "./passing-network";

function event(index: number, teamId: number, type: string, period: number, minute: number, second = 0) {
  return { id: `event-${index}`, index, period, minute, second, type: { name: type }, team: { id: teamId, name: `Team ${teamId}` } };
}

function lineup(teamId: number) {
  return {
    ...event(teamId, teamId, "Starting XI", 1, 0),
    tactics: {
      lineup: Array.from({ length: 11 }, (_, index) => ({
        jersey_number: index + 1,
        player: { id: teamId * 100 + index + 1, name: `Player ${index + 1}` }
      }))
    }
  };
}

function pass(index: number, teamId: number, period: number, minute: number, second = 0) {
  return {
    ...event(index, teamId, "Pass", period, minute, second),
    player: { id: teamId * 100 + 1 },
    location: [25, 30],
    pass: { recipient: { id: teamId * 100 + 2 }, end_location: [55, 20] }
  };
}

test("each side is cut off by its own first lineup change in event order, including stoppage and same-second passes", () => {
  const events = [
    lineup(1), lineup(2),
    pass(3, 1, 1, 46, 40),
    pass(4, 2, 1, 46, 42),
    event(5, 1, "Substitution", 2, 45),
    pass(6, 1, 2, 45),
    { ...event(7, 2, "Bad Behaviour", 2, 56), player: { id: 222 }, bad_behaviour: { card: { name: "Red Card" } } },
    pass(8, 2, 2, 60, 18),
    { ...event(9, 2, "Foul Committed", 2, 60, 18), player: { id: 202 }, foul_committed: { card: { name: "Second Yellow" } } },
    pass(10, 2, 2, 60, 18),
    event(11, 1, "Half End", 2, 92, 10),
    event(12, 2, "Half End", 2, 92, 10)
  ];
  const [first, second] = readPassingNetworks(events.reverse());
  assert.deepEqual([first.cutoff, first.reason, first.passes], ["45:00", "substitution", 1]);
  assert.deepEqual([second.cutoff, second.reason, second.passes], ["60:18", "dismissal", 2]);
  assert.deepEqual(second.links, [{ from: 201, to: 202, count: 2 }]);
});

test("unchanged lineups include added time; only completed, located passes between starters enter the graph", () => {
  const forward = pass(3, 1, 1, 8);
  const events = [
    lineup(1), lineup(2),
    forward,
    { ...pass(4, 1, 2, 55), pass: { ...forward.pass, outcome: { name: "Incomplete" } } },
    { ...pass(5, 1, 2, 65), pass: { ...forward.pass, recipient: { id: 122 } } },
    { ...pass(6, 1, 2, 70), location: [-5, 30] },
    { ...pass(7, 1, 2, 93), player: { id: 102 }, location: [60, 40], pass: { recipient: { id: 101 }, end_location: [35, 50] } },
    event(8, 1, "Half End", 2, 94, 27),
    event(9, 2, "Half End", 2, 94, 27),
    pass(10, 1, 5, 95)
  ];
  const [first, second] = readPassingNetworks(events);
  assert.equal(first.cutoff, "90+4:27");
  assert.equal(first.reason, "fullTime");
  assert.equal(first.passes, 2);
  assert.deepEqual(first.links, [{ from: 101, to: 102, count: 1 }, { from: 102, to: 101, count: 1 }]);
  assert.deepEqual(first.players.map(({ id, x, y }) => [id, x, y]), [[101, 30, 40], [102, 57.5, 30]]);
  assert.equal(second.passes, 0);
});

test("duplicate event keys, incomplete games and oversized input are rejected", () => {
  const first = lineup(1);
  const second = lineup(2);
  const expectError = (code: PassingFileError["code"]) => (failure: unknown) => failure instanceof PassingFileError && failure.code === code;
  assert.throws(() => readPassingNetworks([first, second, first]), expectError("duplicates"));
  assert.throws(() => readPassingNetworks([first, second, { ...first, id: "different" }]), expectError("duplicates"));
  assert.throws(() => readPassingNetworks([first, second, pass(3, 1, 2, 50)]), expectError("incomplete"));
  assert.throws(() => readPassingNetworks({ events: [] }), expectError("invalid"));
  assert.throws(() => readPassingNetworks(Array(12_001).fill(first)), expectError("tooLarge"));
});
