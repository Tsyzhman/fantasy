import assert from "node:assert/strict";
import test from "node:test";

import { archivedExpectedMinutes, blendArchivedEventRate, FNL_TO_RPL_EVENT_FACTOR } from "./player-season-prior";

test("prior-season rate remains after one RPL match and disappears after 900 minutes", () => {
  const afterOne = blendArchivedEventRate({
    position: "MID",
    event: "goals",
    currentRatePer90: 0.1,
    currentMinutes: 90,
    currentEvents: 0.1,
    priorAppearances: 11,
    priorEvents: 1,
    tierFactor: FNL_TO_RPL_EVENT_FACTOR
  });
  const covered = blendArchivedEventRate({
    position: "MID",
    event: "goals",
    currentRatePer90: 0.1,
    currentMinutes: 900,
    currentEvents: 1,
    priorAppearances: 11,
    priorEvents: 1,
    tierFactor: FNL_TO_RPL_EVENT_FACTOR
  });

  assert.ok(afterOne && afterOne.fade > 0.8);
  assert.equal(covered?.fade, 0);
  assert.equal(covered?.ratePer90, 0.1);
});

test("unknown archive assists are not treated as confirmed zero", () => {
  assert.equal(blendArchivedEventRate({
    position: "MID",
    event: "assists",
    currentRatePer90: 0.2,
    currentMinutes: 0,
    currentEvents: 0,
    priorAppearances: 20,
    priorEvents: null,
    tierFactor: FNL_TO_RPL_EVENT_FACTOR
  }), null);
});

test("archive appearance share supports minutes and fades after eight covered team matches", () => {
  const beforeRpl = archivedExpectedMinutes({
    existingMinutes: 0,
    priorAppearances: 30,
    priorTeamMatches: 34,
    currentTeamStatMatches: 0,
    sameTeam: true
  });
  const afterOne = archivedExpectedMinutes({
    existingMinutes: 0,
    priorAppearances: 30,
    priorTeamMatches: 34,
    currentTeamStatMatches: 1,
    sameTeam: true
  });
  const covered = archivedExpectedMinutes({
    existingMinutes: 0,
    priorAppearances: 30,
    priorTeamMatches: 34,
    currentTeamStatMatches: 8,
    sameTeam: true
  });
  assert.ok(beforeRpl > 61 && beforeRpl < 62);
  assert.ok(afterOne > 53 && afterOne < 55);
  assert.equal(covered, 0);
});
