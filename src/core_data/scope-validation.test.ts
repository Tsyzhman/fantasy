import assert from "node:assert/strict";
import test from "node:test";

import { createIngestionScope } from "./ingestion-scope";
import { ScopeTooBroadError, validate_ingestion_scope } from "./scope-validation";

test("scope guard blocks excessive match counts before detail fetching", () => {
  const scope = createIngestionScope({ league_id: 47, season: "2023/2024", max_matches: 700 });
  const matches = Array.from({ length: 3000 }, (_, index) => fixture(index + 1, "47", `2023-08-${String((index % 28) + 1).padStart(2, "0")}`));

  assert.throws(() => validate_ingestion_scope(scope, matches), ScopeTooBroadError);
});

test("scope guard blocks implausible date spans", () => {
  const scope = createIngestionScope({ league_id: 47, season: "2023/2024", max_matches: 700 });
  const matches = [fixture(1, "47", "2013-01-01"), fixture(2, "47", "2026-01-01")];

  assert.throws(() => validate_ingestion_scope(scope, matches), /spans/);
});

test("scope guard rejects matches from another league", () => {
  const scope = createIngestionScope({ league_id: 47, season: "2023/2024", max_matches: 700 });

  assert.throws(() => validate_ingestion_scope(scope, [fixture(1, "55", "2023-08-01")]), /not requested league/);
});

test("scope guard allows alias fixtures for canonical league scopes", () => {
  const scope = createIngestionScope({ league_id: 9001, canonical_league_id: 50, season: "2024", max_matches: 700 });

  assert.doesNotThrow(() => validate_ingestion_scope(scope, [fixture(1, "9001", "2024-06-14"), fixture(2, "50", "2024-06-15")]));
});

function fixture(id: number, leagueId: string, date: string) {
  return {
    id: String(id),
    leagueId,
    homeTeamId: "10",
    awayTeamId: "20",
    kickoffAt: `${date}T12:00:00.000Z`,
    status: "FINISHED" as const,
    homeScore: 1,
    awayScore: 0
  };
}
