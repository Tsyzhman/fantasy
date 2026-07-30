import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { FormulaAdaptationBreakdown } from "../../machete/formula_adaptations";
import { FormulaAdaptationBreakdownContent, formulaAdaptationBreakdownHref } from "./FormulaAdaptationHoverCard";

const breakdown: FormulaAdaptationBreakdown = {
  version: "test-v1",
  baseName: "alt_current",
  profile: "jointAccepted",
  position: "FWD",
  baseValue: 6.5,
  intercept: 1.25,
  numericTerms: [{
    name: "opponent_possession_h10",
    rawValue: 54,
    usedValue: 54,
    trainedMedian: 50,
    valueSource: "raw",
    coefficient: 0.01,
    valueContribution: 0.54,
    missingCoefficient: null,
    missingContribution: 0,
    totalContribution: 0.54
  }],
  categoricalTerms: [{
    name: "opponent_coach",
    category: "coach-1",
    coefficientSource: "direct",
    coefficient: -0.14,
    contribution: -0.14
  }],
  numericContributionTotal: 0.54,
  categoricalContributionTotal: -0.14,
  rawPrediction: 1.65,
  predictionClamp: [-2, 15],
  clampedPrediction: 1.65,
  minuteGuard: {
    expectedMinutes: 30,
    starterFloorMinutes: 60,
    factor: 0.5,
    applied: true,
    beforeGuard: 1.65,
    afterGuard: 0.825
  },
  minuteAdjustedPrediction: 0.825,
  roundedPrediction: 0.825,
  trainingSamples: 321,
  weatherIncluded: false
};

test("formula adaptation detail URL preserves the active history sample and removes squad state", () => {
  const href = formulaAdaptationBreakdownHref(
    "/api/machete/squads?leagueId=63&season=2026%2F2027&squadId=squad-1&historyScope=ALL_PLAYER_MATCHES&historyWindow=SELECTED_SEASONS&historySeason=2024%2F2025&historySeason=2025%2F2026",
    "12345"
  );

  assert.ok(href);
  const parsed = new URL(href, "http://localhost");
  assert.equal(parsed.pathname, "/api/machete/squads/formula-adaptations");
  assert.equal(parsed.searchParams.get("leagueId"), "63");
  assert.equal(parsed.searchParams.get("season"), "2026/2027");
  assert.equal(parsed.searchParams.get("playerId"), "12345");
  assert.equal(parsed.searchParams.has("squadId"), false);
  assert.deepEqual(parsed.searchParams.getAll("historySeason"), ["2024/2025", "2025/2026"]);
});

test("formula adaptation detail URL is unavailable when the player pool has no server source", () => {
  assert.equal(formulaAdaptationBreakdownHref(undefined, "12345"), null);
});

test("short formula tooltip keeps the arithmetic but omits coefficient tables", () => {
  const html = renderToStaticMarkup(React.createElement(FormulaAdaptationBreakdownContent, {
    playerName: "Test Player",
    columnLabel: "Alt Joint accepted",
    breakdown,
    loading: false,
    failed: false,
    language: "ru",
    detailed: false
  }));

  assert.match(html, /Test Player/);
  assert.match(html, /1\.25 \+ 0\.54 \+ -0\.14 = 1\.65/);
  assert.match(html, /минутный порог/);
  assert.match(html, /1\.65 × 0\.5 = 0\.825/);
  assert.match(html, /Подробные подсказки/);
  assert.doesNotMatch(html, /opponent_possession_h10/);
  assert.doesNotMatch(html, /Числовые слагаемые/);
});

test("detailed formula tooltip preserves every coefficient table", () => {
  const html = renderToStaticMarkup(React.createElement(FormulaAdaptationBreakdownContent, {
    playerName: "Test Player",
    columnLabel: "Alt Joint accepted",
    breakdown,
    loading: false,
    failed: false,
    language: "ru",
    detailed: true
  }));

  assert.match(html, /Числовые слагаемые \(1\)/);
  assert.match(html, /opponent_possession_h10/);
  assert.match(html, /Категориальные слагаемые \(1\)/);
  assert.match(html, /opponent_coach/);
  assert.doesNotMatch(html, /Включите «Подробные подсказки»/);
});
