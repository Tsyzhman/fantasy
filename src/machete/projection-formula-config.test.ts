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
  assert.match(friendAltProjectionFormulaConfig.history.expectedMinutes, /^max\(/);
  assert.match(friendAltProjectionFormulaConfig.history.xgRate, /Minutes L10/);
  assert.match(friendAltProjectionFormulaConfig.history.xgRate, /safe_div/);
  assert.doesNotMatch(friendAltProjectionFormulaConfig.scoreByPosition.DEF, /goals conceded/i);
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

  assert.match(friendAltProjectionFormulaConfig.history.expectedMinutes, /^max\(/);
  assert.equal(friendAltProjectionFormulaConfig.team.expectedGoals, "{Projected xG}");
});
