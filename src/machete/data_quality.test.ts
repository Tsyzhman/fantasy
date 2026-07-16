import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFantasyDataQuality, forecastMissingReasons, isBasicPlayerStatComplete, type ForecastCoverageCandidate } from "./data_quality";

test("forecast availability requires history, position, score, minutes, confidence, and update date", () => {
  const complete = candidate();
  const missing = candidate({ matchesPlayed: 0, position: null, fantasyScore: null, expectedMinutes: null, forecastConfidence: null, dataUpdatedAt: null });

  assert.deepEqual(forecastMissingReasons(complete), []);
  assert.deepEqual(forecastMissingReasons(missing), [
    "NO_MATCH_HISTORY",
    "UNKNOWN_POSITION",
    "NO_FANTASY_SCORE",
    "NO_EXPECTED_MINUTES",
    "NO_CONFIDENCE",
    "NO_DATA_UPDATE_DATE"
  ]);
});

test("basic stat completeness accepts numeric zero but rejects absent performance data", () => {
  assert.equal(isBasicPlayerStatComplete({ position: "Defender", minutes: 0, goals: 0 }), true);
  assert.equal(isBasicPlayerStatComplete({ position: "Defender", minutes: null, started: false, substitutedIn: false }), true);
  assert.equal(isBasicPlayerStatComplete({ position: "Defender", minutes: null, started: false, substitutedIn: null }), true);
  assert.equal(isBasicPlayerStatComplete({ position: "Defender", minutes: null, started: null, substitutedIn: null }), false);
  assert.equal(isBasicPlayerStatComplete({ position: "Defender", minutes: 90 }), false);
  assert.equal(isBasicPlayerStatComplete({ position: null, minutes: 90, rating: 7 }), false);
});

test("data quality gate reports coverage and unverifiable ingestion latency", () => {
  const report = evaluateFantasyDataQuality(
    [candidate(), candidate({ playerKey: "2", hasBasicStats: false })],
    [
      {
        matchId: "1",
        hasPlayerStats: true,
        rawReceivedAt: new Date("2025-01-01T12:00:00.000Z"),
        normalizedAt: new Date("2025-01-01T14:00:00.000Z")
      },
      {
        matchId: "2",
        hasPlayerStats: true,
        rawReceivedAt: null,
        normalizedAt: new Date("2025-01-02T14:00:00.000Z")
      }
    ],
    [
      { position: "Forward", minutes: 90, rating: 7 },
      { position: "Forward", minutes: 90 }
    ],
    { coveragePercent: 50, maximumPromotionLatencyHours: 6 }
  );

  assert.equal(report.forecasts.coveragePercent, 100);
  assert.equal(report.players.coveragePercent, 50);
  assert.equal(report.statRows.coveragePercent, 50);
  assert.equal(report.matches.promotionLatencyCoveragePercent, 50);
  assert.equal(report.betaGate.checks.promotionLatency, false);
  assert.equal(report.betaGate.passed, false);
});

function candidate(overrides: Partial<ForecastCoverageCandidate> = {}): ForecastCoverageCandidate {
  return { ...candidateBase(), ...overrides };
}

function candidateBase() {
  return {
    playerKey: "1",
    playerName: "Player",
    teamName: "Team",
    position: "Forward",
    matchesPlayed: 5,
    fantasyScore: 4.2,
    expectedMinutes: 75,
    forecastConfidence: 0.8,
    dataUpdatedAt: new Date("2025-01-01T12:00:00.000Z"),
    hasBasicStats: true
  };
}
