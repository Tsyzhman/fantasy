import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluatePlannerDefaultScope,
  evaluatePlannerReadiness,
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
      forecastCoverage: 99,
      startedAt: new Date("2026-07-17T10:00:00.000Z"),
      completedAt: new Date("2026-07-17T10:05:00.000Z")
    },
    ingestion: {
      id: "ingestion-1",
      status: "completed",
      startedAt: new Date("2026-07-17T03:00:00.000Z"),
      finishedAt: new Date("2026-07-17T09:00:00.000Z")
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
      forecastCoverage: 99,
      startedAt: new Date("2026-07-17T07:00:00.000Z"),
      completedAt: new Date("2026-07-17T07:05:00.000Z")
    },
    ingestion: {
      id: "ingestion-1",
      status: "failed",
      startedAt: new Date("2026-07-17T08:00:00.000Z"),
      finishedAt: new Date("2026-07-17T09:00:00.000Z")
    }
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.reasons, ["NO_UPCOMING_FIXTURES", "INCREMENTAL_INGESTION_NOT_COMPLETED", "AUDIT_PREDATES_INGESTION"]);
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
