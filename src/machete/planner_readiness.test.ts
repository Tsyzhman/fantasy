import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluatePlannerDefaultScope,
  evaluatePlannerReadiness,
  completedIngestionScope,
  plannerReadinessKey,
  selectPlannerSeason,
  type PlannerReadiness
} from "./planner_readiness";
import type { SharedLeagueSeasonOption } from "./shared_read_model";

const now = new Date("2026-07-17T12:00:00.000Z");

test("planner readiness requires fixtures, an exact passing audit, and a fresh completed ingestion audited afterwards", () => {
  const ready = evaluatePlannerReadiness({
    leagueId: 47n,
    season: "2026/2027",
    activePlayers: 626,
    upcomingFixtures: 380,
    maximumAgeHours: 26,
    now,
    audit: {
      id: "audit-1",
      status: "COMPLETED",
      gatePassed: true,
      coverageThreshold: 98,
      forecastCoverage: 99,
      finishedMatches: 380,
      startedAt: new Date("2026-07-17T10:00:00.000Z"),
      completedAt: new Date("2026-07-17T10:05:00.000Z")
    },
    ingestion: {
      id: "ingestion-1",
      status: "completed",
      startedAt: new Date("2026-07-17T03:00:00.000Z"),
      finishedAt: new Date("2026-07-17T09:00:00.000Z"),
      upcomingFixturesDiscovered: 380
    }
  });

  assert.equal(ready.ready, true);
  assert.deepEqual(ready.reasons, []);
});

test("a fresh audit cannot hide missing fixtures, a failed latest ingestion, or an audit made before ingestion", () => {
  const result = evaluatePlannerReadiness({
    leagueId: 47n,
    season: "2026/2027",
    activePlayers: 626,
    upcomingFixtures: 0,
    maximumAgeHours: 26,
    now,
    audit: {
      id: "audit-1",
      status: "COMPLETED",
      gatePassed: true,
      coverageThreshold: 98,
      forecastCoverage: 99,
      finishedMatches: 380,
      startedAt: new Date("2026-07-17T07:00:00.000Z"),
      completedAt: new Date("2026-07-17T07:05:00.000Z")
    },
    ingestion: {
      id: "ingestion-1",
      status: "failed",
      startedAt: new Date("2026-07-17T08:00:00.000Z"),
      finishedAt: new Date("2026-07-17T09:00:00.000Z"),
      upcomingFixturesDiscovered: 0
    }
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.reasons, ["NO_UPCOMING_FIXTURES", "INCREMENTAL_INGESTION_NOT_COMPLETED", "AUDIT_PREDATES_INGESTION"]);
});

test("preseason planner readiness uses forecast coverage without pretending the full match-data gate passed", () => {
  const result = evaluatePlannerReadiness({
    leagueId: 47n,
    season: "2026/2027",
    activePlayers: 626,
    upcomingFixtures: 380,
    maximumAgeHours: 26,
    now,
    audit: {
      id: "audit-preseason",
      status: "COMPLETED",
      gatePassed: false,
      coverageThreshold: 98,
      forecastCoverage: 98.403,
      finishedMatches: 0,
      startedAt: new Date("2026-07-17T10:00:00.000Z"),
      completedAt: new Date("2026-07-17T10:05:00.000Z")
    },
    ingestion: {
      id: "ingestion-current",
      status: "completed",
      startedAt: new Date("2026-07-17T09:00:00.000Z"),
      finishedAt: new Date("2026-07-17T09:30:00.000Z"),
      upcomingFixturesDiscovered: 380
    }
  });

  assert.equal(result.ready, true);
  assert.equal(result.audit?.mode, "PRESEASON_FORECAST");
  assert.equal(result.audit?.plannerGatePassed, true);
  assert.equal(result.audit?.gatePassed, false);
});

test("preseason planner readiness still rejects forecast coverage below the configured threshold", () => {
  const result = evaluatePlannerReadiness({
    leagueId: 47n,
    season: "2026/2027",
    activePlayers: 626,
    upcomingFixtures: 380,
    maximumAgeHours: 26,
    now,
    audit: {
      id: "audit-preseason-low",
      status: "COMPLETED",
      gatePassed: false,
      coverageThreshold: 98,
      forecastCoverage: 97.9,
      finishedMatches: 0,
      startedAt: new Date("2026-07-17T10:00:00.000Z"),
      completedAt: new Date("2026-07-17T10:05:00.000Z")
    },
    ingestion: {
      id: "ingestion-current",
      status: "completed",
      startedAt: new Date("2026-07-17T09:00:00.000Z"),
      finishedAt: new Date("2026-07-17T09:30:00.000Z"),
      upcomingFixturesDiscovered: 380
    }
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.reasons, ["FORECAST_COVERAGE_GATE_FAILED"]);
  assert.equal(result.audit?.plannerGatePassed, false);
});

test("planner readiness rejects partial fixture discovery even when the database already contains the full schedule", () => {
  const result = evaluatePlannerReadiness({
    leagueId: 47n,
    season: "2026/2027",
    activePlayers: 626,
    upcomingFixtures: 380,
    maximumAgeHours: 26,
    now,
    audit: {
      id: "audit-preseason",
      status: "COMPLETED",
      gatePassed: false,
      coverageThreshold: 98,
      forecastCoverage: 98.403,
      finishedMatches: 0,
      startedAt: new Date("2026-07-17T10:00:00.000Z"),
      completedAt: new Date("2026-07-17T10:05:00.000Z")
    },
    ingestion: {
      id: "ingestion-partial",
      status: "completed",
      startedAt: new Date("2026-07-17T09:00:00.000Z"),
      finishedAt: new Date("2026-07-17T09:30:00.000Z"),
      upcomingFixturesDiscovered: 1
    }
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.reasons, ["INGESTION_FIXTURE_COUNT_MISMATCH"]);
});

test("incremental evidence requires an exact successful league-season scope", () => {
  const metadata = {
    completed_canonical_scopes: [
      { league_id: 47, season: "2026/2027", status: "completed", upcoming_fixtures_discovered: 380 },
      { league_id: 87, season: "2026/2027", status: "completed_with_errors", upcoming_fixtures_discovered: 380 }
    ]
  };
  assert.equal(completedIngestionScope(metadata, 47n, "2026/2027")?.status, "completed");
  assert.equal(completedIngestionScope(metadata, 47n, "2025/2026"), null);
  assert.equal(completedIngestionScope(metadata, 87n, "2026/2027")?.status, "completed_with_errors");
});

test("automatic selection uses only a ready exact scope while an explicit unready season remains selected and flagged", () => {
  const oldSeason = season("2025/2026", false, "2026-07-16T00:00:00.000Z");
  const currentSeason = season("2026/2027", true, "2026-07-17T00:00:00.000Z");
  const readiness = new Map<string, PlannerReadiness>([
    [plannerReadinessKey(oldSeason), readinessFor(oldSeason, true)],
    [plannerReadinessKey(currentSeason), readinessFor(currentSeason, false)]
  ]);

  const automatic = selectPlannerSeason(undefined, [currentSeason, oldSeason], readiness);
  assert.equal(automatic.option?.season, "2025/2026");
  assert.equal(automatic.explicit, false);
  assert.equal(automatic.readiness?.ready, true);

  const explicit = selectPlannerSeason("2026/2027", [currentSeason, oldSeason], readiness);
  assert.equal(explicit.option?.season, "2026/2027");
  assert.equal(explicit.explicit, true);
  assert.equal(explicit.readiness?.ready, false);
});

test("automatic selection returns no season when no exact scope is ready", () => {
  const oldSeason = season("2025/2026", false, "2026-07-16T00:00:00.000Z");
  const currentSeason = season("2026/2027", true, "2026-07-17T00:00:00.000Z");
  const readiness = new Map<string, PlannerReadiness>([
    [plannerReadinessKey(oldSeason), readinessFor(oldSeason, false)],
    [plannerReadinessKey(currentSeason), readinessFor(currentSeason, false)]
  ]);

  assert.equal(selectPlannerSeason(undefined, [currentSeason, oldSeason], readiness).option, null);
});

test("health rejects a ready automatic planner scope when that exact scope is not scheduled for audit", () => {
  const currentSeason = season("2026/2027", true, "2026-07-17T00:00:00.000Z");
  const readiness = new Map([[plannerReadinessKey(currentSeason), readinessFor(currentSeason, true)]]);

  assert.deepEqual(
    evaluatePlannerDefaultScope("47", [currentSeason], readiness, new Set(["47:2025/2026"])),
    {
      leagueId: "47",
      healthy: false,
      reason: "DEFAULT_PLANNER_SCOPE_NOT_CONFIGURED",
      scope: { leagueId: "47", season: "2026/2027" },
      configured: false,
      readiness: readiness.get("47:2026/2027")
    }
  );
});

function season(value: string, isCurrent: boolean, updatedAt: string): SharedLeagueSeasonOption {
  return {
    leagueId: 47n,
    season: value,
    name: "Premier League",
    displayName: "Premier League",
    country: "England",
    providerLeagueId: "47",
    isCurrent,
    updatedAt: new Date(updatedAt)
  };
}

function readinessFor(option: SharedLeagueSeasonOption, ready: boolean): PlannerReadiness {
  return {
    leagueId: String(option.leagueId),
    season: option.season,
    ready,
    reasons: ready ? [] : ["NO_UPCOMING_FIXTURES"],
    activePlayers: 600,
    upcomingFixtures: ready ? 380 : 0,
    maximumAgeHours: 26,
    audit: null,
    ingestion: null
  };
}
