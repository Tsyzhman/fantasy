/** @spec spec://modules/machete/FEAT-008-platform-transfer-trends#counting */
import test from "node:test";
import assert from "node:assert/strict";
import { PlatformTransferCounter, platformRosterIds, platformSavedFootballRoster } from "./platform-transfer-trends";

test("counts net squad membership including bench, percentages use comparable unchanged participants", () => {
  const counter = new PlatformTransferCounter();
  counter.add([{ playerId: "1", isStarter: false, isCaptain: false }, { playerId: "3" }], ["1", "2"], 2, "football");
  counter.add(["1", "3"], [{ playerId: "1", isCaptain: true }, { playerId: "2" }], 2, "football");
  counter.add(["2", "1"], ["1", "2"], 2, "football");
  counter.add(["1", "3"], null, 2, "football");
  assert.equal(counter.participants, 4);
  assert.equal(counter.compared, 3);
  assert.deepEqual(counter.top("buys"), [{ playerId: "3", count: 2, percent: 200 / 3 }]);
  assert.deepEqual(counter.top("sells"), [{ playerId: "2", count: 2, percent: 200 / 3 }]);
});

test("returning to baseline, captain and slot changes yield no purchases or sales", () => {
  const counter = new PlatformTransferCounter();
  counter.add([{ playerId: "2", isCaptain: true, slotIndex: 0 }, { playerId: "1", isStarter: false }], ["1", "2"], 2, "football");
  assert.equal(counter.compared, 1);
  assert.deepEqual(counter.top("buys"), []);
  assert.deepEqual(counter.top("sells"), []);
});

test("reject incomplete, duplicate and malformed rosters without manufacturing sales", () => {
  for (const roster of [null, [], ["1"], ["1", "1"], ["0", "2"], ["01", "2"], ["9223372036854775808", "2"], ["wat", "2"], [{}, "2"]]) {
    assert.equal(platformRosterIds(roster, 2, "football"), null);
    const counter = new PlatformTransferCounter();
    counter.add(roster, ["1", "2"], 2, "football");
    counter.add(["1", "2"], roster, 2, "football");
    assert.equal(counter.compared, 0);
    assert.deepEqual(counter.top("sells"), []);
  }
  assert.deepEqual(platformRosterIds(["provider-placeholder:SPORTS_RU:123", "2"], 2, "football"), ["provider-placeholder:SPORTS_RU:123", "2"]);
  assert.deepEqual(platformRosterIds([{ id: "khl-a" }, { id: "khl-b" }], 2, "khl"), ["khl-a", "khl-b"]);
});

test("top five uses descending unique counts with deterministic ties", () => {
  const counter = new PlatformTransferCounter();
  for (const id of ["8", "7", "6", "5", "4", "3", "2"]) counter.add([id], ["1"], 1, "football");
  counter.add(["8"], ["1"], 1, "football");
  assert.deepEqual(counter.top("buys").map(r => [r.playerId, r.count]), [["8", 2], ["2", 1], ["3", 1], ["4", 1], ["5", 1]]);
  assert.equal(counter.top("sells")[0].count, 8);
});

test("round identity chooses the right future plan, and stale or broken plans stay excluded", () => {
  const base = { fallback: ["1", "2"], targetRoundId: "sports-ru:tour:11:t11", updatedAt: new Date("2026-10-06"), baselineStartsAt: new Date("2026-10-05") };
  const filters = { roundPlanRoundIds: ["sports-ru:tour:10:t10", base.targetRoundId], roundPlans: [{ roundOffset: 0, selections: ["1", "2"] }, { roundOffset: 1, selections: ["1", "3"] }] };
  assert.deepEqual(platformSavedFootballRoster({ ...base, filters }), ["1", "3"]);
  assert.equal(platformSavedFootballRoster({ ...base, filters, targetRoundId: "sports-ru:tour:12:t12" }), null);
  assert.deepEqual(platformSavedFootballRoster({ ...base, filters: {} }), ["1", "2"]);
  assert.equal(platformSavedFootballRoster({ ...base, filters: {}, updatedAt: new Date("2026-10-04") }), null);
  assert.deepEqual(platformSavedFootballRoster({ ...base, filters: { roundPlans: [{ roundOffset: 0, selections: [] }] } }), []);
  assert.equal(platformSavedFootballRoster({ ...base, filters: { roundPlans: [{}] } }), null);
});
