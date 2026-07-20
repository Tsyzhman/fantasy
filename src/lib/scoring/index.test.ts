import assert from "node:assert/strict";
import test from "node:test";

import { calculateFantasyScore, calculateScoringScore, getActiveScoringModelForSource, type ActiveScoringModel } from "./index";

const customExpectedModel: ActiveScoringModel = {
  modelSource: "MACHETE",
  customFormula: null,
  customFormulaGk: null,
  customFormulaDef: null,
  customFormulaMid: null,
  customFormulaFwd: "{Matches played} + 4*{Goals} + 3*{Assists} - {Yellow cards}",
  customFormulaEnabled: true,
  scoringFormulaGk: null,
  scoringFormulaDef: null,
  scoringFormulaMid: null,
  scoringFormulaFwd: "{Matches played} + 4*{Goals} + 3*{Assists} - {Yellow cards}",
  scoringFormulaEnabled: true,
  alternativeFormulaGk: null,
  alternativeFormulaDef: null,
  alternativeFormulaMid: null,
  alternativeFormulaFwd: null,
  alternativeFormulaEnabled: false,
  rules: []
};

test("custom Expected FP formulas use one-match projected values", () => {
  const rawMetrics = {
    matches_played: 10,
    minutes_played: 900,
    goals: 10,
    assists: 5,
    yellow_cards: 2,
    shots_on_target: 20
  };

  assert.equal(calculateFantasyScore(rawMetrics, "FWD", customExpectedModel), 6.3);
  assert.equal(calculateFantasyScore(rawMetrics, "FWD", { ...customExpectedModel, customFormulaFwd: "{Shots on target}" }), 2);
});

test("custom Actual FP formulas keep aggregate values", () => {
  const rawMetrics = {
    matches_played: 10,
    minutes_played: 900,
    goals: 10,
    assists: 5,
    yellow_cards: 2
  };

  assert.equal(calculateScoringScore(rawMetrics, "FWD", customExpectedModel), 63);
});

test("default Expected FP prefers xG and xA when projection stats are available", () => {
  const rawMetrics = {
    matches_played: 10,
    minutes_played: 900,
    goals: 10,
    xg: 4,
    assists: 5,
    xa: 2,
    yellow_cards: 2
  };

  assert.equal(calculateFantasyScore(rawMetrics, "FWD", { ...customExpectedModel, customFormulaEnabled: false }), 5);
});

test("built-in Machete model does not leak fixture Alt formulas into historical aggregates", async () => {
  const client = { fantasyModel: { findFirst: async () => null } };
  const model = await getActiveScoringModelForSource("MACHETE", client as never);

  assert.equal(model.alternativeFormulaEnabled, false);
  assert.equal(model.alternativeFormulaGk, null);
});
