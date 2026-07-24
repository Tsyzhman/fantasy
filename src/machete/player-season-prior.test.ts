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
    priorMinutes: 770,
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
    priorMinutes: 770,
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
    priorMinutes: 1400,
    priorEvents: null,
    tierFactor: FNL_TO_RPL_EVENT_FACTOR
  }), null);
});

test("FNL goal and assist proxies use real archive minutes when detailed xG/xA is unavailable", () => {
  const goals = blendArchivedEventRate({
    position: "FWD",
    event: "goals",
    currentRatePer90: 0,
    currentMinutes: 0,
    currentEvents: 0,
    priorAppearances: 30,
    priorMinutes: 1800,
    priorEvents: 6,
    tierFactor: FNL_TO_RPL_EVENT_FACTOR
  });
  const assists = blendArchivedEventRate({
    position: "FWD",
    event: "assists",
    currentRatePer90: 0,
    currentMinutes: 0,
    currentEvents: 0,
    priorAppearances: 30,
    priorMinutes: 1800,
    priorEvents: 3,
    tierFactor: FNL_TO_RPL_EVENT_FACTOR
  });

  assert.ok(goals && goals.ratePer90 > assists!.ratePer90);
  assert.ok(goals && goals.ratePer90 < 6 * 90 / 1800);
  assert.ok(assists && assists.ratePer90 < 3 * 90 / 1800);
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
