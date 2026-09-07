/** @spec spec://modules/machete/FEAT-004-rotation-risk#acceptance */
import assert from "node:assert/strict";
import test from "node:test";
import { calculateRotationRisk, currentRotationRisk, rotationRestRisk, weightedRotationRisk, rotationRiskDescription } from "./rotation-risk";
import { fantasySquadStrategyPlayerScore, type FantasyPlannerPlayer } from "./squad_logic";
import { toFantasyPlayerPoolListItem } from "./squad-player-dto";
import { parseSquadTableColumns } from "./squad-table-columns";
import { fantasyPlayerPoolSnapshotHasCurrentRotationRisk } from "./fantasy-player-pool-snapshots";
const now = new Date("2026-09-07T12:00:00Z");
const kickoff = new Date("2026-09-08T12:00:00Z");
const day = 86400000;
const input = { observedAt: now, kickoffAt: kickoff, lastPlayedAt: new Date(+kickoff - 2 * day), history: Array.from({ length: 50 }, (_, i) => ({ matchId: String(i + 1), matchDate: new Date(+now - (i + 1) * day), started: i >= 10 })) };

test("RR baseline exact example, bounds, invalid values and every rest threshold", () => {
  assert.ok(Math.abs(weightedRotationRisk([.2, .25, .3, .4], rotationRestRisk(2))! - .363) < 1e-12);
  assert.equal(weightedRotationRisk([0, 0, 0, 0], 0), 0);
  assert.equal(weightedRotationRisk([1, 1, 1, 1], 1), 1);
  for (const [days, risk] of [[0, 1], [1.999, 1], [2, .72], [2.999, .72], [3, .4], [4, .16], [5, 0], [30, 0]]) assert.equal(rotationRestRisk(days), risk);
  for (const value of [null, -1, NaN, Infinity]) assert.equal(rotationRestRisk(value), null);
  assert.equal(weightedRotationRisk([0, null, 0, 0], 0), null);
  assert.equal(weightedRotationRisk([0, 0, 0, 2], 0), null);
  assert.equal(weightedRotationRisk([0, 0, 0], 0), null);
});

test("known lineups are chronological, deduplicated, bounded and immutable; unknown/future rows excluded", () => {
  const history = [...input.history, input.history[0], { matchId: "unknown", matchDate: now, started: null }, { matchId: "future", matchDate: kickoff, started: false }];
  const before = JSON.stringify(history);
  const result = calculateRotationRisk({ ...input, history });
  assert.deepEqual(result.windows.map((w) => [w.starts, w.bench, w.risk]), [[40, 10, .2], [10, 10, .5], [0, 10, 1], [0, 5, 1]]);
  assert.ok(Math.abs(result.value! - .738) < 1e-12);
  assert.equal(result.restDays, 2);
  assert.equal(JSON.stringify(history), before);
  assert.deepEqual(calculateRotationRisk({ ...input, history: [...history].reverse() }), result);
});

test("short windows use known counts; missing lineups, rest or next fixture remain unknown", () => {
  const short = calculateRotationRisk({ ...input, history: input.history.slice(0, 2) });
  assert.ok(short.reasons.includes("SHORT_HISTORY"));
  assert.ok(short.windows.every((w) => w.starts + w.bench === 2));
  assert.equal(calculateRotationRisk({ ...input, history: [] }).value, null);
  assert.equal(calculateRotationRisk({ ...input, lastPlayedAt: null }).value, null);
  assert.equal(calculateRotationRisk({ ...input, lastPlayedAt: kickoff }).value, null);
  assert.equal(calculateRotationRisk({ ...input, kickoffAt: now }).value, null);
  assert.equal(calculateRotationRisk({ ...input, kickoffAt: null }).value, null);
  const result = calculateRotationRisk(input);
  assert.equal(currentRotationRisk(result, +now), result.value);
  assert.equal(currentRotationRisk(result, Date.parse(result.expiresAt)), null);
  assert.equal(currentRotationRisk(result, +now - 1), null);
});

test("RR survives list/Worker serialization, columns persist and explanation shows counts", () => {
  const risk = calculateRotationRisk(input);
  const dto = toFantasyPlayerPoolListItem({ playerId: "1", rotationRisk: risk } as FantasyPlannerPlayer);
  assert.deepEqual(structuredClone(dto).rotationRisk, risk);
  assert.deepEqual(parseSquadTableColumns(["rotationRisk", "nextFp", "rotationRisk"]), ["rotationRisk", "nextFp"]);
  assert.match(rotationRiskDescription(risk, "ru", +now), /R50: 10\/50/);
  assert.match(rotationRiskDescription(risk, "ru", +now), /Дней отдыха: 2/);
  assert.match(rotationRiskDescription(risk, "ru", Date.parse(risk.expiresAt)), /устарел/);
});

test("reliable uses current RR once, preserves EP and keeps old fallback on expiry", () => {
  const liveNow = new Date();
  const risk = calculateRotationRisk({ ...input, observedAt: liveNow, kickoffAt: new Date(+liveNow + day), lastPlayedAt: new Date(+liveNow - day) });
  const player = { playerId: "1", predictedFp: 10, roundPoints: [10], forecastConfidence: 1, priceSource: "SPORTS_RU", expectedMinutes: 90, startProbability: 1, forecastRisks: [] } as unknown as FantasyPlannerPlayer;
  const risky = { ...player, rotationRisk: risk };
  assert.ok(Math.abs(fantasySquadStrategyPlayerScore(risky, 1, "reliable") - 10 * (1 - risk.value!)) < 1e-12);
  for (const strategy of ["balanced", "upside", "GLOBAL_AUTO"] as const) assert.equal(fantasySquadStrategyPlayerScore(risky, 1, strategy), fantasySquadStrategyPlayerScore(player, 1, strategy));
  assert.equal(fantasySquadStrategyPlayerScore({ ...risky, rotationRisk: { ...risk, expiresAt: new Date(0).toISOString() } }, 1, "reliable"), fantasySquadStrategyPlayerScore(player, 1, "reliable"));
  assert.equal(player.predictedFp, 10);
});

test("legacy/expired snapshots require sequential RR refresh without rejecting old metadata", () => {
  const metadata = { version: 1, readiness: {}, rules: {}, rounds: [], bookmakerFavorites: [], priceStatus: {}, historySeasonOptions: [], dataFreshness: {} };
  assert.equal(fantasyPlayerPoolSnapshotHasCurrentRotationRisk(metadata, +now), false);
  const current = { ...metadata, rotationRiskVersion: "RR_V1", rotationRiskExpiresAt: kickoff.toISOString() };
  assert.equal(fantasyPlayerPoolSnapshotHasCurrentRotationRisk(current, +now), true);
  assert.equal(fantasyPlayerPoolSnapshotHasCurrentRotationRisk(current, +kickoff), false);
});
