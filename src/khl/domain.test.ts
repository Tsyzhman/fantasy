import assert from "node:assert/strict";
import test from "node:test";
import { parseToi, unknown, compareNullable, type KhlPlayer } from "./contracts";
import { validateRoster, weekAt, transferAvailability } from "./rules";
import { scoreMatch } from "./scoring";
import { previewTransfers } from "./transfers";
import { optimizeKhl } from "./optimizer";
import { expectedSavePoints, goalieStartDistribution, baselineProjection } from "./projections";
import { parseHockeyCatalog } from "../providers/sports-ru-hockey/catalog";
const now = Date.parse("2026-09-07T09:00:00Z");
export function fixturePlayer(i: number): KhlPlayer {
  const obs = <T>(value: T) => ({ value, quality: "FACT" as const, source: "test", asOf: new Date(now).toISOString() });
  return { id: `p${i}`, playerId: `internal${i}`, contestId: "test", name: `Player ${i}`, clubId: `club${i % 7}`, clubName: `Club ${i % 7}`, position: i < 2 ? "G" : i < 8 ? "D" : "F", price: obs(1000), priceRevision: 1, priceDelta: null, providerLock: obs(false), injury: unknown("fixture"), toiSeconds: unknown("fixture"), ppToiSeconds: unknown("fixture"), pkToiSeconds: unknown("fixture"), officialFp: unknown("fixture"), ep: obs(i), ixg: unknown("fixture"), saves: unknown("fixture"), goalsAgainst: unknown("fixture"), fixtures: [] };
}

test("OPT-01 full 1000-player pool returns a valid bounded incumbent", () => {
  const players = Array.from({ length: 1000 }, (_, i) => ({ ...fixturePlayer(i % 17), id: `large-${i}`, playerId: `canonical-${i}`, clubId: `club-${i % 22}` }));
  const result = optimizeKhl({ players, capital: 20000, keep: [], exclude: [], owned: [], maxTransfers: 17, now, timeoutMs: 500 });
  assert.ok(result.players, result.status);
  assert.deepEqual(validateRoster(result.players, 20000), []);
  assert.ok(result.elapsedMs < 1500, `Bounded solver took ${result.elapsedMs}ms`);
  assert.ok(["OK", "TIME_LIMIT"].includes(result.status));
});
test("RULE-01: 17 active, positions, duplicates, clubs and appreciated capital", () => {
  const team = Array.from({ length: 17 }, (_, i) => fixturePlayer(i));
  assert.deepEqual(validateRoster(team, 20000), []);
  assert.ok(validateRoster(team.slice(1), 20000).includes("POSITION_G"));
  assert.ok(validateRoster([...team.slice(0, 16), team[0]], 20000).includes("DUPLICATE_PLAYER"));
  assert.ok(validateRoster(team.map(p => ({ ...p, clubId: "one" })), 20000).includes("CLUB_LIMIT"));
  assert.deepEqual(validateRoster(team.map(p => ({ ...p, price: { ...p.price, value: 2000 } })), 34000), []);
});
test("RULE-03: official week remains week 1 on 7 September, unknown boundaries do not reset", () => {
  const week = { id: "w1", contestId: "test", providerWeekId: "1", label: "1", startsAt: "2026-09-01T00:00:00Z", endsAt: "2026-09-14T00:00:00Z", timezone: "UTC", verified: true, revision: 1 };
  assert.equal(weekAt([week], now)?.id, "w1");
  assert.equal(weekAt([{ ...week, verified: false }], now), null);
  assert.equal(weekAt([week, { ...week, id: "overlap" }], now), null);
});
test("RULE-04/ING-03: exact seconds, null, odd saves and Isaev control", () => {
  assert.deepEqual(["20:50", "06:05", "00:44", "", "20:60"].map(parseToi), [1250, 365, 44, null, null]);
  const input = { position: "G" as const, toiSeconds: 3600, result: "W60" as const, goals: 0, assists: 0, plusMinus: null, pim: 0, saves: 21, goalsAgainst: 1, fullGame: true, teamShutout: false };
  assert.equal(scoreMatch(input).total, 12);
  assert.equal(scoreMatch({ ...input, toiSeconds: 2400 }).total, null);
  assert.equal(scoreMatch({ ...input, saves: null }).total, null);
  assert.equal(scoreMatch({ ...input, toiSeconds: 0 }).total, null);
});
test("RULE-05/OPT-02: sequential return purchase spends two operations; no official mutation", () => {
  const selected = Array.from({ length: 17 }, (_, i) => fixturePlayer(i));
  const incoming = { ...fixturePlayer(17), clubId: selected[16].clubId };
  const data = { selected, pool: [...selected, incoming], bank: 3000, used: 4, preSeason: false, now };
  assert.deepEqual(previewTransfers({ ...data, steps: [{ out: "p16", in: "p17" }] }).violations, []);
  const back = previewTransfers({ ...data, steps: [{ out: "p16", in: "p17" }, { out: "p17", in: "p16" }] });
  assert.ok(back.violations.includes("TRANSFER_LIMIT"));
  assert.equal(back.externalExecuted, false);
  assert.ok(previewTransfers({ ...data, used: null, steps: [] }).violations.includes("UNKNOWN_TRANSFER_BALANCE"));
  assert.equal(data.used, 4);
});
test("UI-02: provider lock and time guard are independent from keep", () => {
  const p = fixturePlayer(0);
  assert.equal(transferAvailability(p, now + 60001), "LOCK_UNKNOWN_OR_STALE");
  assert.equal(transferAvailability({ ...p, fixtures: [{ id: "m", weekId: "w", startsAt: new Date(now + 1800000).toISOString(), opponent: "x", status: "SCHEDULED", startProbability: unknown("test") }] }, now), "MATCH_LOCK");
});
test("MOD-02: E[floor(SV/2)], exclusive starter distribution and no future leakage", () => {
  assert.equal(expectedSavePoints([{ saves: 1, probability: .5 }, { saves: 2, probability: .5 }]), .5);
  assert.equal(expectedSavePoints([{ saves: 20, probability: .2 }]), null);
  assert.equal(goalieStartDistribution([{ id: "a", weight: 1, confirmed: true }, { id: "b", weight: 1, confirmed: true }]), null);
  assert.equal(goalieStartDistribution([])?.unknownOther, 1);
  assert.equal(baselineProjection({ history: [{ fp: 2, availableAt: now }, { fp: 100, availableAt: now + 1 }], fixtures: [{ startsAt: now + 1, status: "SCHEDULED" }], asOf: now, calendarComplete: true }).ep, 2);
});
test("OPT-01: exact small pool matches brute force; timeout is not infeasible", () => {
  const players = Array.from({ length: 19 }, (_, i) => fixturePlayer(i));
  const result = optimizeKhl({ players, capital: 20000, keep: [], exclude: [], owned: [], maxTransfers: 17, now });
  let oracle = -Infinity;
  for (let a = 0; a < 19; a++) for (let b = a + 1; b < 19; b++) {
    const team = players.filter((_, i) => i !== a && i !== b);
    if (!validateRoster(team, 20000).length) oracle = Math.max(oracle, team.reduce((n, p) => n + p.ep.value!, 0));
  }
  assert.equal(result.score, oracle);
  assert.equal(result.status, "OK");
  assert.deepEqual(validateRoster(result.players!, 20000), []);
  assert.equal(optimizeKhl({ players, capital: 20000, keep: [], exclude: [], owned: [], maxTransfers: 17, now, timeoutMs: 0 }).status, "TIME_LIMIT_NO_SOLUTION");
});
test("ING-02: actual Sports.ru envelope, sport gate and duplicate quarantine", () => {
  const row = { id: 1, club_id: 2, club: "Club", name: "Name", sport_name: "hockey", amplua: 1, price: "500", lock: "0" };
  const parsed = parseHockeyCatalog({ players: [row, row, { ...row, id: 2, sport_name: "football" }], teams: [] });
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.quarantined.length, 2);
  assert.equal(parsed.rows[0].providerLock, false);
  assert.equal(parsed.rows[0].currentPriceUnits, 500);
  assert.equal(parseHockeyCatalog([{ ...row, price: "" }]).rows[0].currentPriceUnits, null);
});
test("UI-03: null sorts last in both directions", () => {
  for (const direction of [1, -1] as const) assert.equal([null, 0, 10].sort((a, b) => compareNullable(a, b, direction)).at(-1), null);
});
