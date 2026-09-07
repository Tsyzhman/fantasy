/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#acceptance */
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFplGlobalSource, loadSportsGlobalSource, type StrategyBinding } from "./global-strategy-providers";
import { fplRelayPathAllowed, fplRelayRequestPath, type FplBootstrap } from "@/lib/providers/fpl";
import sportsFixture from "./__fixtures__/global-strategy-sports.json";
import { globalStrategyScoreHistory } from "@/machete/global-strategy";
const now = new Date("2026-09-07T10:00:00Z");
const binding: StrategyBinding = { provider: "FPL", contestId: "c1", tournamentKey: "fpl", season: "2026/2027", providerSeasonId: "2026/2027", providerUserId: "123", providerSquadId: "123" };
function fixture() {
  // Synthetic protocol fixture. This does not claim a successful live FPL/relay verification.
  const bootstrap: FplBootstrap = { totalPlayers: 10000000, fetchedAt: now, events: Array.from({ length: 38 }, (_, i) => ({ id: i + 1, name: `GW${i + 1}`, deadlineTime: new Date(+now + (i - 2) * 604800000),
    finished: i < 3, dataChecked: i < 3, isPrevious: i === 2, isCurrent: false, isNext: i === 3, released: true, averageEntryScore: 50 })), elements: [], teams: [], elementTypes: [], chips: [], gameConfig: {} };
  const entry = { id: 123, current_event: 3, summary_overall_rank: 250, summary_overall_points: 130 };
  const history = { current: [{ event: 1, points: 65, total_points: 65, overall_rank: 400 }, { event: 2, points: 0, total_points: 65, overall_rank: 450 }, { event: 3, points: 65, total_points: 130, overall_rank: 250 }] };
  const standings = { league: { id: 999, name: "Overall", league_type: "s" }, standings: { results: [{ rank: 1, total: 200 }] }, last_updated_data: now.toISOString() };
  return { bootstrap, entry, history, standings };
}
test("FPL coherent official stage, zero-score observation and exact deadline", () => {
  const f = fixture();
  const result = normalizeFplGlobalSource(binding, now, f.bootstrap, f.entry, f.history, f.standings, f.entry);
  assert.equal(result.context.remainingRounds, 35);
  assert.equal(result.context.roundScoreScale, 130 / 3);
  assert.equal(result.context.standingsRoundId, "3");
});
test("FPL mixed revisions, live scores and incomplete calendar are rejected", () => {
  const f = fixture();
  assert.throws(() => normalizeFplGlobalSource(binding, now, f.bootstrap, f.entry, f.history, f.standings, { ...f.entry, summary_overall_points: 131 }), /INCOHERENT_STANDINGS/);
  f.bootstrap.events[2].finished = false;
  assert.throws(() => normalizeFplGlobalSource(binding, now, f.bootstrap, f.entry, f.history, f.standings, f.entry), /STANDINGS_RECALCULATING/);
  f.bootstrap.events.pop();
  assert.throws(() => normalizeFplGlobalSource(binding, now, f.bootstrap, f.entry, f.history, f.standings, f.entry), /INCOMPLETE_CALENDAR/);
});
test("relay permits only exact numeric history/standings routes on official origin", () => {
  for (const path of ["/api/entry/123/history/", "/api/leagues-classic/999/standings/"]) assert.equal(fplRelayPathAllowed(path), true);
  for (const path of ["/api/entry/0/history/", "/api/entry/123/history/extra", "/api/leagues-classic/me/standings/", "/api/entry/123/transfers/"]) assert.equal(fplRelayPathAllowed(path), false);
  assert.throws(() => fplRelayRequestPath("https://example.com/api/entry/123/history/"));
});
test("Sports.ru 429 does not retry before Retry-After; temporary 503 retries once", async () => {
  for (const [status, calls] of [[429, 1], [503, 2]]) {
    let actual = 0;
    await assert.rejects(loadSportsGlobalSource({ ...binding, provider: "SPORTS_RU", tournamentKey: "russia", providerSeasonId: "75" }, now,
      (async () => { actual++; return new Response("", { status, headers: { "retry-after": "60" } }); }) as typeof fetch), status === 429 ? /PROVIDER_RATE_LIMITED/ : /PROVIDER_UNAVAILABLE/);
    assert.equal(actual, calls);
  }
});

test("recorded anonymized Sports.ru response supplies real score history but refuses live standings", async () => {
  assert.equal(sportsFixture.coherent, true);
  assert.equal(globalStrategyScoreHistory(sportsFixture.history)?.roundScoreScale, 70.5);
  const fetchImpl = (async () => new Response(JSON.stringify({ data: { fantasyQueries: { tournament: { currentSeason: sportsFixture.season } } } }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  await assert.rejects(loadSportsGlobalSource({ ...binding, provider: "SPORTS_RU", tournamentKey: "russia", providerSeasonId: sportsFixture.season.id }, new Date(sportsFixture.recordedAt), fetchImpl), /STANDINGS_RECALCULATING/);
});
