import assert from "node:assert/strict";
import test from "node:test";

import {
  FORMULA_ADAPTATION_HYPOTHESES,
  FORMULA_ADAPTATION_WEATHER_INCLUDED,
  aggregateFormulaAdaptationPredictions,
  addPromotedFormulaAdaptationTeamProfiles,
  addFormulaAdaptationInteractions,
  buildFormulaAdaptationPlayerFeatures,
  buildFormulaAdaptationTeamProfiles,
  formulaAdaptationMinuteFeatures,
  formulaAdaptationFixtureFeatures,
  predictFormulaAdaptations,
  predictFormulaAdaptationsWithBreakdowns,
  type FormulaAdaptationTeamProfiles
} from "./formula_adaptations";

test("six adaptations are independent finite forecasts and the artifact excludes weather", () => {
  const forecasts = predictFormulaAdaptations({
    leagueId: "47",
    position: "FWD",
    fo: 5.2,
    alt: 5.8,
    features: {
      player_target_h10: 5,
      player_target_sd_h10: 1.2,
      player_minutes_h10: 84,
      player_rating_h10: 7.4,
      team_id: "9825",
      opponent_team_id: "8650",
      is_home: "True",
      age: 25
    }
  });

  assert.equal(FORMULA_ADAPTATION_WEATHER_INCLUDED, false);
  assert.equal(FORMULA_ADAPTATION_HYPOTHESES.allWithoutWeather.includes("weather" as never), false);
  assert.equal(Object.keys(forecasts).length, 6);
  assert.ok(Object.values(forecasts).every((value) => typeof value === "number" && Number.isFinite(value)));
  assert.notEqual(forecasts.foPositionCalibratedFp, forecasts.altPositionCalibratedFp);
  assert.notEqual(forecasts.foJointAllFp, forecasts.foJointAcceptedFp);
});

test("detailed adaptations expose every additive term and reproduce the displayed forecast", () => {
  const prediction = predictFormulaAdaptationsWithBreakdowns({
    leagueId: "63",
    position: "MID",
    fo: 5.2,
    alt: 5.8,
    features: {
      player_target_h10: 5,
      player_minutes_h10: 84,
      team_id: "168719",
      opponent_team_id: "1066681",
      is_home: "True"
    }
  });

  for (const [key, breakdown] of Object.entries(prediction.breakdowns)) {
    assert.ok(breakdown, `${key} should have a detailed breakdown`);
    const numericTotal = breakdown.numericTerms.reduce((sum, term) => sum + term.totalContribution, 0);
    const categoricalTotal = breakdown.categoricalTerms.reduce((sum, term) => sum + term.contribution, 0);
    assert.ok(Math.abs(numericTotal - breakdown.numericContributionTotal) < 1e-9);
    assert.ok(Math.abs(categoricalTotal - breakdown.categoricalContributionTotal) < 1e-9);
    assert.ok(Math.abs(breakdown.intercept + numericTotal + categoricalTotal - breakdown.rawPrediction) < 1e-9);
    assert.equal(
      Math.round(breakdown.minuteAdjustedPrediction * 1000) / 1000,
      prediction.forecasts[key as keyof typeof prediction.forecasts]
    );
    assert.equal(breakdown.minuteGuard === null, breakdown.profile === "position");
    assert.equal(breakdown.weatherIncluded, false);
  }

  const jointAll = prediction.breakdowns.altJointAllFp;
  assert.ok(jointAll);
  assert.ok(jointAll.numericTerms.some((term) => term.valueSource === "trained_median"));
  assert.ok(jointAll.numericTerms.some((term) => term.rawValue === null && term.missingCoefficient !== null));
});

test("double round adaptations score each fixture independently and expose both breakdowns", () => {
  const fixturePrediction = (fixtureId: string, opponentTeamId: string, fo: number, alt: number) => ({
    fixtureId,
    fixtureLabel: `${fixtureId} opponent`,
    prediction: predictFormulaAdaptationsWithBreakdowns({
      leagueId: "63",
      position: "MID",
      fo,
      alt,
      features: {
        player_target_h10: 5,
        player_minutes_h10: 84,
        team_id: "168719",
        opponent_team_id: opponentTeamId,
        is_home: fixtureId === "first" ? "True" : "False"
      }
    })
  });
  const first = fixturePrediction("first", "1066681", 4.1, 4.6);
  const second = fixturePrediction("second", "9825", 5.3, 5.9);
  const round = aggregateFormulaAdaptationPredictions([first, second]);

  for (const key of Object.keys(round.forecasts) as Array<keyof typeof round.forecasts>) {
    const firstValue = first.prediction.forecasts[key];
    const secondValue = second.prediction.forecasts[key];
    assert.equal(round.forecasts[key], Math.round(((firstValue ?? 0) + (secondValue ?? 0)) * 1000) / 1000);
    assert.deepEqual(round.breakdowns[key]?.roundFixtures?.map((fixture) => fixture.fixtureId), ["first", "second"]);
    assert.equal(round.breakdowns[key]?.roundedPrediction, round.forecasts[key]);
  }
});

test("player adaptations calculate 3/5/10 form and recovery/pass interactions from prior matches", () => {
  const features = buildFormulaAdaptationPlayerFeatures([
    match("2026-01-01", 4, 90, 4),
    match("2026-01-08", 6, 80, 6),
    match("2026-01-15", 5, 85, 8)
  ]);
  const withContext = addFormulaAdaptationInteractions({
    ...features,
    expected_opponent_possession_h5: 58,
    expected_opponent_pass_accuracy_h5: 86
  });

  assert.equal(features.player_target_h3, 5);
  assert.equal(features.player_minutes_h10, 85);
  assert.equal(features.player_history_n_h10, 3);
  assert.equal(withContext.recovery_x_opp_possession_h5, (withContext.player_recoveries_per90_h5 as number) * 0.8);
  assert.equal(withContext.recovery_x_opp_pass_accuracy_h5, (withContext.player_recoveries_per90_h5 as number) * 0.6);
});

test("team profiles expose possession, opponent pass accuracy, zones and rest without weather", () => {
  const profiles = buildFormulaAdaptationTeamProfiles([
    {
      matchDate: "2026-01-01",
      homeTeamId: "a",
      awayTeamId: "b",
      teamStats: [
        { teamId: "a", opponentTeamId: "b", isHome: true, goals: 2, xg: 1.8, shots: 12, shotsOnTarget: 5, bigChances: 3, touchesInOppBox: 24, possession: 60, passes: 500, accuratePasses: 450, passAccuracy: 90 },
        { teamId: "b", opponentTeamId: "a", isHome: false, goals: 1, xg: 0.9, shots: 8, shotsOnTarget: 3, bigChances: 1, touchesInOppBox: 14, possession: 40, passes: 350, accuratePasses: 280, passAccuracy: 80 }
      ],
      shots: [
        { teamId: "a", normalizedY: 15, xg: 0.2 },
        { teamId: "a", normalizedY: 50, xg: 0.8 },
        { teamId: "b", normalizedY: 85, xg: 0.4 }
      ]
    }
  ]);
  const features = formulaAdaptationFixtureFeatures({
    profiles,
    teamId: "a",
    opponentTeamId: "b",
    kickoffAt: new Date("2026-01-11"),
    side: "H"
  });

  assert.equal(features.own_team_possession_h10, 60);
  assert.equal(features.opponent_team_pass_accuracy_h10, 80);
  assert.equal(features.expected_possession_h10, 50);
  assert.equal(features.expected_opponent_possession_h10, 50);
  assert.equal(features.own_days_rest, 10);
  assert.equal(features.shot_center_share_h10, 0.5);
  assert.equal(Object.keys(features).some((key) => /weather|temperature|precipitation/i.test(key)), false);
});

test("Joint receives the same expected-minute and event-exposure inputs as FO and Alt", () => {
  const features = formulaAdaptationMinuteFeatures("fo", 5, {
    expectedMinutes: 60,
    baseExpectedMinutes: 55,
    eventExposureMinutes: 45,
    appearanceProbability: 0.9,
    sixtyMinutesProbability: 0.7,
    fullMatchProbability: 0.2
  });

  assert.equal(features.fo_expected_minutes, 60);
  assert.equal(features.fo_expected_minutes_squared, 3_600);
  assert.equal(features.fo_base_expected_minutes, 55);
  assert.equal(features.fo_event_exposure_ratio, 0.75);
  assert.equal(features.fo_current_x_expected_minutes_ratio, 5 * 60 / 90);
  assert.equal(features.fo_current_x_event_exposure_ratio, 2.5);
  assert.equal(features.fo_sixty_probability, 0.7);
});

test("minute exposure changes Joint but does not alter position-only calibration", () => {
  const base = {
    leagueId: "63",
    position: "MID" as const,
    fo: 5,
    alt: 5,
    features: {
      player_target_h10: 5,
      player_minutes_h10: 80
    }
  };
  const sixty = predictFormulaAdaptations({
    ...base,
    features: {
      ...base.features,
      ...formulaAdaptationMinuteFeatures("fo", 5, {
        expectedMinutes: 60,
        baseExpectedMinutes: 60,
        eventExposureMinutes: 60,
        appearanceProbability: 1,
        sixtyMinutesProbability: 1,
        fullMatchProbability: 0
      }),
      ...formulaAdaptationMinuteFeatures("alt", 5, {
        expectedMinutes: 60,
        baseExpectedMinutes: 60,
        eventExposureMinutes: 60,
        appearanceProbability: 1,
        sixtyMinutesProbability: 1,
        fullMatchProbability: 0
      })
    }
  });
  const ninety = predictFormulaAdaptations({
    ...base,
    features: {
      ...base.features,
      ...formulaAdaptationMinuteFeatures("fo", 5, {
        expectedMinutes: 90,
        baseExpectedMinutes: 90,
        eventExposureMinutes: 90,
        appearanceProbability: 1,
        sixtyMinutesProbability: 1,
        fullMatchProbability: 1
      }),
      ...formulaAdaptationMinuteFeatures("alt", 5, {
        expectedMinutes: 90,
        baseExpectedMinutes: 90,
        eventExposureMinutes: 90,
        appearanceProbability: 1,
        sixtyMinutesProbability: 1,
        fullMatchProbability: 1
      })
    }
  });

  assert.equal(sixty.foPositionCalibratedFp, ninety.foPositionCalibratedFp);
  assert.equal(sixty.altPositionCalibratedFp, ninety.altPositionCalibratedFp);
  assert.notEqual(sixty.foJointAcceptedFp, ninety.foJointAcceptedFp);
  assert.notEqual(sixty.altJointAllFp, ninety.altJointAllFp);
});

test("Joint keeps the FO/Alt starter-minute decline below 60 without rescaling 60+ forecasts", () => {
  const predictionAt = (expectedMinutes: number) => predictFormulaAdaptationsWithBreakdowns({
    leagueId: "63",
    position: "MID",
    fo: 5,
    alt: 5,
    features: {
      ...formulaAdaptationMinuteFeatures("fo", 5, {
        expectedMinutes,
        baseExpectedMinutes: expectedMinutes,
        eventExposureMinutes: expectedMinutes,
        appearanceProbability: expectedMinutes / 90,
        sixtyMinutesProbability: expectedMinutes >= 60 ? 1 : 0,
        fullMatchProbability: expectedMinutes >= 90 ? 1 : 0
      }),
      ...formulaAdaptationMinuteFeatures("alt", 5, {
        expectedMinutes,
        baseExpectedMinutes: expectedMinutes,
        eventExposureMinutes: expectedMinutes,
        appearanceProbability: expectedMinutes / 90,
        sixtyMinutesProbability: expectedMinutes >= 60 ? 1 : 0,
        fullMatchProbability: expectedMinutes >= 90 ? 1 : 0
      })
    }
  });

  const zero = predictionAt(0);
  const thirty = predictionAt(30);
  const sixty = predictionAt(60);
  for (const key of ["foJointAcceptedFp", "altJointAcceptedFp", "foJointAllFp", "altJointAllFp"] as const) {
    assert.equal(zero.forecasts[key], 0);
    assert.equal(zero.breakdowns[key]?.minuteGuard?.factor, 0);
    assert.equal(thirty.breakdowns[key]?.minuteGuard?.factor, 0.5);
    assert.equal(
      thirty.forecasts[key],
      Math.round((thirty.breakdowns[key]?.clampedPrediction ?? Number.NaN) * 0.5 * 1000) / 1000
    );
    assert.equal(sixty.breakdowns[key]?.minuteGuard?.factor, 1);
    assert.equal(sixty.breakdowns[key]?.minuteAdjustedPrediction, sixty.breakdowns[key]?.clampedPrediction);
  }
  assert.equal(zero.breakdowns.foPositionCalibratedFp?.minuteGuard, null);
  assert.notEqual(zero.forecasts.foPositionCalibratedFp, 0);
});

test("promoted Formula Joint profiles use the top-flight FNL adapter without overriding an RPL team", () => {
  const topLeague: FormulaAdaptationTeamProfiles = new Map([
    ["orenburg", {
      features: {
        team_xg_h10: 1.5,
        team_xg_against_h10: 1.4,
        team_possession_h10: 52
      },
      lastMatchDateMs: 2,
      matches: 10
    }]
  ]);
  const feederLeague: FormulaAdaptationTeamProfiles = new Map([
    ["fakel", {
      features: {
        team_xg_h10: 2,
        team_xg_against_h10: 1,
        team_possession_h10: 60,
        shot_left_share_h10: 0.6
      },
      lastMatchDateMs: 3,
      matches: 10
    }],
    ["rodina", {
      features: {
        team_xg_h10: 1,
        team_xg_against_h10: 2,
        team_possession_h10: 40,
        shot_left_share_h10: 0.4
      },
      lastMatchDateMs: 4,
      matches: 10
    }]
  ]);

  const merged = addPromotedFormulaAdaptationTeamProfiles(
    topLeague,
    feederLeague,
    { strengthFactor: 0.81, ratioExponent: 0.6, priorMatches: 8 }
  );
  const fakel = merged.get("fakel");
  assert.ok(fakel);
  const attackRatio = (10 * (2 / 1.5) + 8) / 18;
  const defenseRatio = (10 * (1.5 / 1) + 8) / 18;
  assert.ok(Math.abs((fakel.features.team_xg_h10 as number) - 1.5 * 0.81 * attackRatio ** 0.6) < 1e-12);
  assert.ok(Math.abs((fakel.features.team_xg_against_h10 as number) - 1.4 / (0.81 * defenseRatio ** 0.6)) < 1e-12);
  assert.ok(Math.abs((fakel.features.team_possession_h10 as number) - (52 + (60 - 50) * 10 / 18)) < 1e-12);
  assert.equal(fakel.features.shot_left_share_h10, 0.6);
  assert.equal(fakel.matches, 10);
  assert.equal(merged.get("orenburg"), topLeague.get("orenburg"));
});

function match(date: string, points: number, minutes: number, recoveries: number) {
  return {
    matchDate: new Date(date),
    points,
    minutes,
    rating: 7,
    xg: 0.2,
    xa: 0.1,
    shots: 2,
    shotsOnTarget: 1,
    recoveries,
    chancesCreated: 1
  };
}
