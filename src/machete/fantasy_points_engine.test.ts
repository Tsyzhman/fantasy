import assert from "node:assert/strict";
import test from "node:test";

import { calculateFantasyScore, type ActiveScoringModel } from "@/lib/scoring";

import { build_fantasy_model_metrics_from_player_stat } from "./fantasy_points_engine";

const model: ActiveScoringModel = {
  modelSource: "MACHETE",
  customFormula: null,
  customFormulaGk: null,
  customFormulaDef: null,
  customFormulaMid: null,
  customFormulaFwd: null,
  customFormulaEnabled: false,
  scoringFormulaGk: null,
  scoringFormulaDef: null,
  scoringFormulaMid: null,
  scoringFormulaFwd: null,
  scoringFormulaEnabled: false,
  alternativeFormulaGk: null,
  alternativeFormulaDef: null,
  alternativeFormulaMid: null,
  alternativeFormulaFwd: null,
  alternativeFormulaEnabled: false,
  rules: []
};

test("shared match player stats expose the metrics expected by the Machete fantasy model", () => {
  const { rawMetrics, positionGroup } = build_fantasy_model_metrics_from_player_stat({
    matchId: 101n,
    playerId: 9n,
    teamId: 10n,
    isHome: true,
    started: true,
    substitutedIn: false,
    minutes: 90,
    position: "Forward",
    goals: 1,
    assists: 1,
    yellowCards: 1,
    redCards: 0,
    saves: 0,
    goalsConceded: null,
    cleanSheet: null,
    xg: 0.72,
    xgot: 0.94,
    xa: 0.31,
    shots: 4,
    shotsOnTarget: 2,
    keyPasses: 3,
    tacklesWon: 1,
    interceptions: 2,
    clearances: 0,
    rating: 7.4,
    statsPayload: {
      stats: [
        {
          title: "Defense",
          stats: {
            Recoveries: {
              key: "recoveries",
              stat: { value: 6, type: "integer" }
            }
          }
        }
      ]
    },
    match: {
      homeTeamId: 10n,
      awayTeamId: 20n,
      homeScore: 2,
      awayScore: 1
    }
  });

  assert.equal(positionGroup, "FWD");
  assert.equal(rawMetrics.matches_played, 1);
  assert.equal(rawMetrics.appearances_60, 1);
  assert.equal(rawMetrics.full_matches, 1);
  assert.equal(rawMetrics.goals, 1);
  assert.equal(rawMetrics.assists, 1);
  assert.equal(rawMetrics.yellow_cards, 1);
  assert.equal(rawMetrics.xg, 0.72);
  assert.equal(rawMetrics.xa, 0.31);
  assert.equal(rawMetrics.shots_on_target, 2);
  assert.equal(rawMetrics.tackles, 1);
  assert.equal(rawMetrics.recoveries, 6);

  assert.equal(calculateFantasyScore(rawMetrics, positionGroup, model), 7.81);
});

test("clean sheets and goals conceded are derived from shared match/team relations when player stats omit them", () => {
  const { rawMetrics, positionGroup } = build_fantasy_model_metrics_from_player_stat({
    matchId: 102n,
    playerId: 4n,
    teamId: 10n,
    isHome: true,
    started: true,
    substitutedIn: false,
    minutes: 90,
    position: "Defender",
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    goalsConceded: null,
    cleanSheet: null,
    xg: null,
    xgot: null,
    xa: null,
    shots: 0,
    shotsOnTarget: 0,
    keyPasses: 0,
    tacklesWon: 2,
    interceptions: 3,
    clearances: 5,
    rating: 7,
    match: {
      homeTeamId: 10n,
      awayTeamId: 20n,
      homeScore: 1,
      awayScore: 0
    }
  });

  assert.equal(positionGroup, "DEF");
  assert.equal(rawMetrics.clean_sheets, 1);
  assert.equal(rawMetrics.goals_conceded, 0);
  assert.equal(calculateFantasyScore(rawMetrics, positionGroup, model), 6);
});
