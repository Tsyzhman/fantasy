import assert from "node:assert/strict";
import test from "node:test";

import { calculateCustomFormulaScore } from "@/lib/scoring/formula";

import {
  expectedProjectionFormulaConfig,
  friendAltProjectionFormulaConfig,
  parseProjectionFormulaConfig,
  projectionFormulaConfigVersion,
  validateProjectionFormulaConfig
} from "./projection-formula-config";

test("Expected and friend Alt defaults contain valid formulas for the full pipeline", () => {
  assert.deepEqual(validateProjectionFormulaConfig(expectedProjectionFormulaConfig), []);
  assert.deepEqual(validateProjectionFormulaConfig(friendAltProjectionFormulaConfig), []);
  assert.match(expectedProjectionFormulaConfig.team.expectedGoals, /Bookmaker implied xG/);
  assert.doesNotMatch(friendAltProjectionFormulaConfig.team.expectedGoals, /Bookmaker/);
  assert.match(friendAltProjectionFormulaConfig.history.expectedMinutes, /0\.65 \* min\(\{Matches 365\}/);
  assert.match(friendAltProjectionFormulaConfig.history.xgRate, /Minutes L10/);
  assert.match(friendAltProjectionFormulaConfig.history.xgRate, /safe_div/);
  assert.match(friendAltProjectionFormulaConfig.allocation.goals, /Expected minutes/);
  assert.equal(calculateCustomFormulaScore(friendAltProjectionFormulaConfig.allocation.goals, {
    blended_xg_per_90: 0.9,
    expected_minutes: 60
  }), 0.6);
  assert.equal(calculateCustomFormulaScore(friendAltProjectionFormulaConfig.allocation.cardExposure, {
    expected_minutes: 60
  }), 2 / 3);
  assert.doesNotMatch(friendAltProjectionFormulaConfig.scoreByPosition.DEF, /goals conceded/i);
});

test("legacy Alt per-90 allocations fall back to minute-scaled formulas", () => {
  const parsed = parseProjectionFormulaConfig({
    ...friendAltProjectionFormulaConfig,
    allocation: {
      goals: "{Blended xG per 90}",
      assists: "{Blended xA per 90}",
      recoveries: "{Blended recoveries per 90}",
      saves: "{Blended saves per 90}",
      cardExposure: "1"
    }
  }, friendAltProjectionFormulaConfig);

  assert.deepEqual(parsed.config.allocation, friendAltProjectionFormulaConfig.allocation);
  assert.equal(parsed.issues.length, 5);
  assert.ok(parsed.issues.every((issue) => issue.message.includes("Expected minutes")));
});

test("friend Alt history formula reproduces minute-adjusted 40/35/25 weighting", () => {
  const score = calculateCustomFormulaScore(friendAltProjectionFormulaConfig.history.xgRate, {
    has_data_365: 1,
    has_data_l10: 1,
    has_data_l5: 1,
    minutes_l10: 450,
    minutes_l5: 225,
    xg_per_90_365: 1,
    xg_per_90_l10: 2,
    xg_per_90_l5: 4
  });

  assert.ok(Math.abs(score - (1.25 / 0.7)) < 1e-12);
});

test("expected minutes are stabilized instead of taking a recent-window maximum", () => {
  const score = calculateCustomFormulaScore(expectedProjectionFormulaConfig.history.expectedMinutes, {
    matches_365: 20,
    matches_l10: 10,
    matches_l5: 5,
    minutes_per_match_365: 45,
    minutes_per_match_l10: 72,
    minutes_per_match_l5: 90
  });

  assert.equal(score, 56.25);
  assert.ok(score < 90);
});

test("80 expected minutes count as a full match in both projection defaults", () => {
  for (const config of [expectedProjectionFormulaConfig, friendAltProjectionFormulaConfig]) {
    assert.equal(calculateCustomFormulaScore(config.history.fullMatchProbability, {
      expected_minutes: 79,
      "60_minute_probability": 1,
      full_match_rate_l5: 0,
      full_match_rate_l10: 0,
      full_match_rate_365: 0
    }), 0);
    assert.equal(calculateCustomFormulaScore(config.history.fullMatchProbability, {
      expected_minutes: 80,
      "60_minute_probability": 1,
      full_match_rate_l5: 0,
      full_match_rate_l10: 0,
      full_match_rate_365: 0
    }), 1);
  }
});

test("Expected team formula uses bookmaker xG only when the line is available", () => {
  const formula = expectedProjectionFormulaConfig.team.expectedGoals;
  const withoutOdds = calculateCustomFormulaScore(formula, {
    projected_xg: 1.4,
    bookmaker_implied_xg: 2,
    bookmaker_odds_available: 0
  });
  const withOdds = calculateCustomFormulaScore(formula, {
    projected_xg: 1.4,
    bookmaker_implied_xg: 2,
    bookmaker_odds_available: 1
  });

  assert.equal(withoutOdds, 1.4);
  assert.ok(Math.abs(withOdds - 1.67) < 1e-12);
});

test("partial override is merged over a selected safe fallback", () => {
  const parsed = parseProjectionFormulaConfig({
    version: projectionFormulaConfigVersion,
    history: { xgRate: "2 * {Friend blended xG per 90}" },
    scoreByPosition: { DEF: "5 * {Expected goals}" }
  }, friendAltProjectionFormulaConfig);

  assert.equal(parsed.config.history.xgRate, "2 * {Friend blended xG per 90}");
  assert.equal(parsed.config.scoreByPosition.DEF, "5 * {Expected goals}");
  assert.equal(parsed.config.history.xaRate, friendAltProjectionFormulaConfig.history.xaRate);
  assert.equal(parsed.config.team.expectedGoals, friendAltProjectionFormulaConfig.team.expectedGoals);
  assert.equal(parsed.usedFallback, true);
  assert.deepEqual(parsed.issues, []);
});

test("invalid individual formulas fall back without discarding valid siblings", () => {
  const parsed = parseProjectionFormulaConfig({
    history: {
      xgRate: "{xG} +",
      xaRate: "1.5 * {xA per 90}"
    }
  }, friendAltProjectionFormulaConfig);

  assert.equal(parsed.config.history.xgRate, friendAltProjectionFormulaConfig.history.xgRate);
  assert.equal(parsed.config.history.xaRate, "1.5 * {xA per 90}");
  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.issues[0]?.path, "history.xgRate");
  assert.equal(parsed.usedFallback, true);
});

test("unsupported version rejects the complete override", () => {
  const parsed = parseProjectionFormulaConfig({
    version: 999,
    team: { expectedGoals: "999" }
  }, friendAltProjectionFormulaConfig);

  assert.deepEqual(parsed.config, friendAltProjectionFormulaConfig);
  assert.equal(parsed.issues[0]?.path, "version");
  assert.equal(parsed.usedFallback, true);
});

test("full validator reports every missing or malformed formula", () => {
  const issues = validateProjectionFormulaConfig({
    version: projectionFormulaConfigVersion,
    history: { expectedMinutes: "1 +" },
    team: {},
    allocation: {},
    scoreByPosition: {}
  });

  assert.ok(issues.some((issue) => issue.path === "history.expectedMinutes" && issue.message.includes("ended unexpectedly")));
  assert.ok(issues.some((issue) => issue.path === "history.xgRate" && issue.message.includes("non-empty")));
  assert.ok(issues.some((issue) => issue.path === "team.expectedGoals"));
  assert.ok(issues.some((issue) => issue.path === "allocation.cardExposure"));
  assert.ok(issues.some((issue) => issue.path === "scoreByPosition.FWD"));
  assert.equal(issues.length, 23);
});

test("parser clones its fallback and never mutates shared defaults", () => {
  const parsed = parseProjectionFormulaConfig({ history: { expectedMinutes: "75" } }, friendAltProjectionFormulaConfig);
  parsed.config.team.expectedGoals = "123";

  assert.match(friendAltProjectionFormulaConfig.history.expectedMinutes, /safe_div/);
  assert.equal(friendAltProjectionFormulaConfig.team.expectedGoals, "{Projected xG}");
});
