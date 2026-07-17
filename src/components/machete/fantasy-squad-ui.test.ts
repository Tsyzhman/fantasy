import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatScore, NULL_GLYPH } from "@/lib/format";
import { compactSquadPlayerName, fixtureChipPresentations } from "./fantasy-squad-ui";

const squadPlannerSource = readFileSync(new URL("./FantasySquadPlanner.tsx", import.meta.url), "utf8");

test("squad player names use an initial and surname while retaining surname particles", () => {
  assert.equal(compactSquadPlayerName("Bryan Mbeumo"), "B. Mbeumo");
  assert.equal(compactSquadPlayerName("Kevin De Bruyne"), "K. De Bruyne");
  assert.equal(compactSquadPlayerName("Virgil van Dijk"), "V. van Dijk");
  assert.equal(compactSquadPlayerName("Алексей Миранчук"), "А. Миранчук");
  assert.equal(compactSquadPlayerName("Neymar"), "Neymar");
});

test("fixture chips hide H/A from visible labels but retain side and original title", () => {
  assert.deepEqual(
    fixtureChipPresentations(["H Arsenal", "Chelsea (A)", "H Fulham, A Everton"], [2, 4, 3], 3),
    [
      { label: "Arsenal", title: "H Arsenal", side: "home", difficulty: 2 },
      { label: "Chelsea", title: "Chelsea (A)", side: "away", difficulty: 4 },
      { label: "Fulham", title: "H Fulham", side: "home", difficulty: 3 },
      { label: "Everton", title: "A Everton", side: "away", difficulty: 3 }
    ]
  );
});

test("player pool renders display-only Alt FP on desktop and as the fourth mobile metric", () => {
  const desktopNext = squadPlannerSource.indexOf('en="Next"');
  const desktopAlt = squadPlannerSource.indexOf('title={alternativePredictedFpTitle(language)}>Alt', desktopNext);
  const desktopHorizon = squadPlannerSource.indexOf('{horizon}R', desktopAlt);
  const mobileMetrics = squadPlannerSource.indexOf('grid-cols-4');
  const mobilePrice = squadPlannerSource.indexOf('formatNumber(player.price, 1)', mobileMetrics);
  const mobileAlt = squadPlannerSource.indexOf('formatScore(player.alternativePredictedFp)', mobilePrice);

  assert.ok(desktopNext >= 0 && desktopAlt > desktopNext && desktopHorizon > desktopAlt);
  assert.ok(mobileMetrics >= 0 && mobilePrice > mobileMetrics && mobileAlt > mobilePrice);
  assert.equal(squadPlannerSource.match(/formatScore\(player\.alternativePredictedFp\)/g)?.length, 2);
  assert.match(squadPlannerSource, /Display only: not used by auto-pick, value, transfers, or round points\./);
  assert.equal(formatScore(null), NULL_GLYPH);
});

test("planner exposes mobile-safe history controls and sends the applied settings when saving", () => {
  assert.match(squadPlannerSource, /fantasyHistoryScopes\.map/);
  assert.match(squadPlannerSource, /fantasyHistoryWindows\.map/);
  assert.match(squadPlannerSource, /type="checkbox"/);
  assert.match(squadPlannerSource, /applyFantasyHistorySearchParams\(url\.searchParams, historyDraft\)/);
  assert.match(squadPlannerSource, /historyScope: historySettings\.scope/);
  assert.match(squadPlannerSource, /historyWindow: historySettings\.window/);
  assert.match(squadPlannerSource, /historySeasons: historySettings\.selectedSeasons/);
});
