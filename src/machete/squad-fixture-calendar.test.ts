import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildFantasyFixtureCalendar } from "./squad-fixture-calendar-builder";
import {
  fantasyFixtureCalendarHorizon,
  fixtureDifficultyFromSignal,
  parseFantasyFixtureCalendar,
  rankFantasyFixtureCalendar,
  type FantasyFixtureCalendar,
  type FantasyFixtureCalendarMatch
} from "./squad-fixture-calendar";
import { fantasyPlayerPoolSnapshotHasFixtureCalendar, parseFantasyPlayerPoolSnapshotMetadata } from "./fantasy-player-pool-snapshots";
import { buildPlannerRoundFixtures, fixtureDifficultyFromMultipliers } from "./squad_planner";

function calendarMatch(id: string, overrides: Partial<FantasyFixtureCalendarMatch> = {}): FantasyFixtureCalendarMatch {
  return {
    id, homeTeamId: "a", awayTeamId: "b", kickoffAt: null, finished: false,
    homeAttack: 1, homeDefense: 5, awayAttack: 5, awayDefense: 1, ...overrides
  };
}

function testCalendar(): FantasyFixtureCalendar {
  return {
    version: 1,
    teams: [{ id: "a", name: "Alpha", shortName: "ALP" }, { id: "b", name: "Beta", shortName: "BET" }],
    rounds: Array.from({ length: 10 }, (_, index) => ({
      id: `provider-tour-${index + 1}`, label: `Tour ${index + 1}`, startsAt: null,
      fixtures: [calendarMatch(`match-${index + 1}`, { homeAttack: index < 5 ? 2 : 5, awayAttack: index < 5 ? 4 : 1 })]
    }))
  };
}

test("calendar uses the existing player FDR thresholds without changing FO/ALT or position weighting", () => {
  const signals = [null, 0.7, 0.82, 0.93999, 0.94, 1.05999, 1.06, 1.17999, 1.18, 1.5];
  assert.deepEqual(signals.map(fixtureDifficultyFromSignal), [null, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
  assert.equal(fixtureDifficultyFromSignal(NaN), null);
  assert.equal(fixtureDifficultyFromSignal(Infinity), null);
  for (const signal of [null, 0.7, 0.9, 1, 1.1, 1.25]) {
    for (const position of ["GK", "DEF", "MID", "FWD", "UNK"] as const) {
      assert.equal(
        fixtureDifficultyFromMultipliers({ attackMultiplier: signal, defenseMultiplier: signal, side: "H" }, position),
        fixtureDifficultyFromSignal(signal)
      );
    }
  }
});

test("calendar reuses provider rounds, stores each match once and includes season teams without fixtures or players", () => {
  const now = new Date("2026-08-31T00:00:00Z");
  const source = buildPlannerRoundFixtures([1, 2, 3].map((number) => ({
    id: `m${number}`, round: "7", providerRoundId: "sports-tour-7", providerRoundLabel: "Тур 7", providerRoundOrdinal: 7,
    matchDate: new Date(`2026-09-0${number}T12:00:00Z`),
    homeTeamId: "a", awayTeamId: "b", homeTeamName: "ALP", awayTeamName: "BET",
    homeTeamFullName: "Alpha", awayTeamFullName: "Beta", finished: false, cancelled: number === 3
  })), now);
  source.teamFullNameById!.set("blank", "Blank FC");
  source.teamShortNameById.set("a", "ALP");
  source.teamShortNameById.set("b", "BET");
  for (const byTeam of source.fixturesByTeamRound.values()) {
    for (const [teamId, fixtures] of byTeam) {
      for (const fixture of fixtures) {
        fixture.attackMultiplier = teamId === "a" ? 1.25 : 0.7;
        fixture.defenseMultiplier = teamId === "a" ? 0.7 : 1.25;
      }
      fixtures.push(fixtures[0]); // A repeated provider row must not create a third match.
    }
  }
  const calendar = buildFantasyFixtureCalendar(source);
  assert.equal(calendar.rounds.length, 1);
  assert.equal(calendar.rounds[0].id, "sports-tour-7");
  assert.equal(calendar.rounds[0].label, "Тур 7");
  assert.equal(calendar.rounds[0].fixtures.length, 2);
  assert.equal(calendar.teams.length, 3);
  assert.strictEqual(parseFantasyFixtureCalendar(calendar), calendar);
  const attack = rankFantasyFixtureCalendar(calendar, "attack", 5);
  assert.deepEqual(attack.rows.map((row) => row.team.id), ["a", "b", "blank"]);
  assert.equal(attack.rows[0].cells[0].length, 2);
  assert.equal(attack.rows[0].averageDifficulty, 1);
  assert.equal(attack.rows[1].cells[0][0].side, "away");
  assert.equal(attack.rows[2].averageDifficulty, null);
  assert.deepEqual(rankFantasyFixtureCalendar(calendar, "defense", 5).rows.map((row) => row.team.id), ["b", "a", "blank"]);
});

test("attack/defence and every 5–10 round horizon rerank only the selected distance without mutating the snapshot", () => {
  const calendar = testCalendar();
  const before = JSON.stringify(calendar);
  for (const horizon of [5, 6, 7, 8, 9, 10] as const) {
    const view = rankFantasyFixtureCalendar(calendar, "attack", horizon);
    assert.equal(view.rounds.length, horizon);
    assert.equal(view.rows[0].cells.length, horizon);
    assert.equal(view.rows[0].fixtureCount, horizon);
    assert.equal(fantasyFixtureCalendarHorizon(horizon), horizon);
  }
  assert.deepEqual(rankFantasyFixtureCalendar(calendar, "attack", 5).rows.map((row) => row.team.id), ["a", "b"]);
  assert.deepEqual(rankFantasyFixtureCalendar(calendar, "attack", 10).rows.map((row) => row.team.id), ["b", "a"]);
  assert.deepEqual(rankFantasyFixtureCalendar(calendar, "defense", 5).rows.map((row) => row.team.id), ["b", "a"]);
  assert.equal(JSON.stringify(calendar), before);
  for (const invalid of [0, 4, 11, NaN, Infinity]) assert.equal(fantasyFixtureCalendarHorizon(invalid), 5);
});

test("double fixtures count separately, blanks and unknown signals never become easy zeros", () => {
  const calendar = testCalendar();
  calendar.rounds = calendar.rounds.slice(0, 3);
  calendar.rounds[0].fixtures = [calendarMatch("one", { homeAttack: 1 }), calendarMatch("two", { homeAttack: 5 })];
  calendar.rounds[1].fixtures = [];
  calendar.rounds[2].fixtures = [calendarMatch("three", { homeAttack: 5 }), calendarMatch("unknown", { homeAttack: null })];
  const row = rankFantasyFixtureCalendar(calendar, "attack", 5).rows.find((value) => value.team.id === "a")!;
  assert.equal(row.fixtureCount, 4);
  assert.equal(row.ratedFixtures, 3);
  assert.equal(row.averageDifficulty, 11 / 3);
  assert.deepEqual(row.cells.map((cell) => cell.length), [2, 0, 2]);
  calendar.rounds.forEach((round) => round.fixtures.forEach((fixture) => { fixture.homeAttack = null; }));
  const allUnknown = rankFantasyFixtureCalendar(calendar, "attack", 10);
  assert.equal(allUnknown.rounds.length, 3, "do not invent unavailable rounds");
  assert.equal(allUnknown.rows.at(-1)?.team.id, "a");
  assert.equal(allUnknown.rows.at(-1)?.averageDifficulty, null);
});

test("an unmapped opponent retains its name and missing signals stay neutral", () => {
  const calendar = testCalendar();
  calendar.rounds = [{ id: "unknown", label: "Tour 1", startsAt: null, fixtures: [calendarMatch("unmapped", {
    awayTeamId: null, awayUnmappedName: "Unmapped United", homeAttack: null, homeDefense: null
  })] }];
  assert.strictEqual(parseFantasyFixtureCalendar(calendar), calendar);
  const cell = rankFantasyFixtureCalendar(calendar, "attack", 5).rows.find((row) => row.team.id === "a")!.cells[0][0];
  assert.equal(cell.opponentName, "Unmapped United");
  assert.equal(cell.difficulty, null);
});

test("calendar metadata rejects duplicates and malformed ratings instead of breaking a background refresh", () => {
  for (const invalid of [null, {}, { version: 2 }, { version: 1, teams: [], rounds: [{}] }]) assert.equal(parseFantasyFixtureCalendar(invalid), null);
  const mutations: Array<(calendar: FantasyFixtureCalendar) => void> = [
    (calendar) => { calendar.teams.push(calendar.teams[0]); },
    (calendar) => { calendar.rounds.push(calendar.rounds[0]); },
    (calendar) => { calendar.rounds[1].fixtures[0].id = calendar.rounds[0].fixtures[0].id; },
    (calendar) => { calendar.rounds[0].fixtures[0].homeAttack = 0; },
    (calendar) => { calendar.rounds[0].fixtures[0].homeDefense = NaN; },
    (calendar) => { calendar.rounds[0].fixtures[0].kickoffAt = "not a date"; },
    (calendar) => { calendar.rounds[0].fixtures[0].homeTeamId = "outside-calendar"; }
  ];
  for (const mutate of mutations) {
    const calendar = testCalendar();
    mutate(calendar);
    assert.equal(parseFantasyFixtureCalendar(calendar), null);
  }
});

test("old snapshots remain readable while the sequential worker upgrades calendar metadata once", () => {
  const oldMetadata = {
    version: 1, readiness: {}, rules: {}, rounds: [], bookmakerFavorites: [], priceStatus: {}, historySeasonOptions: [],
    dataFreshness: { fotmobStatsAt: null, bookmakerOddsAt: null }
  };
  assert.ok(parseFantasyPlayerPoolSnapshotMetadata(oldMetadata));
  assert.equal(fantasyPlayerPoolSnapshotHasFixtureCalendar(oldMetadata), false);
  assert.equal(fantasyPlayerPoolSnapshotHasFixtureCalendar({ ...oldMetadata, fixtureCalendar: testCalendar() }), true);
  assert.equal(fantasyPlayerPoolSnapshotHasFixtureCalendar({ ...oldMetadata, fixtureCalendar: { version: 2 } }), false);
  const snapshots = readFileSync(new URL("./fantasy-player-pool-snapshots.ts", import.meta.url), "utf8");
  assert.match(snapshots, /if \(fantasyPlayerPoolSnapshotHasFixtureCalendar\(existing\?\.metadata\)\) continue/);
  assert.match(snapshots, /const metadata = \{ \.\.\.previousMetadata, startingXiTeamRevisions: xiAfter\.teamRevisions \}/, "XI-only publication preserves the existing calendar");
});

test("calendar is lazy, memoized and shared once per snapshot update, not duplicated in each player batch", () => {
  const client = readFileSync(new URL("../components/machete/FantasyFixtureCalendar.tsx", import.meta.url), "utf8");
  const planner = readFileSync(new URL("../components/machete/FantasySquadPlanner.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/machete/squads/route.ts", import.meta.url), "utf8");
  const dto = readFileSync(new URL("./squad-player-dto.ts", import.meta.url), "utf8");
  assert.match(client, /memo\(function FantasyFixtureCalendar/);
  assert.match(client, /IntersectionObserver/);
  assert.match(client, /sticky left-0/);
  assert.match(client, /section ref=\{sectionRef\} className="relative /, "contain absolute screen-reader labels inside the scrollable calendar");
  assert.match(client, /<col className="w-32 sm:w-44" \/>/, "keep a complete fixture visible beside the team and average on mobile");
  assert.match(client, /<FdrPill/);
  assert.doesNotMatch(client, /fetch\(|setInterval\(|localStorage|squad_planner/);
  assert.match(planner, /fixtureCalendarSnapshotIdRef\.current !== pinnedSnapshotId/);
  assert.match(planner, /if \(cursor === "0"\) batchUrl\.searchParams\.set\("fixtureCalendar", "1"\)/);
  assert.match(route, /if \(progressiveCursor === 0 && params\.get\("fixtureCalendar"\) === "1"\)/);
  assert.doesNotMatch(dto, /fixtureCalendar/);
  assert.match(planner, /<FantasyFixtureCalendar calendar=\{fixtureCalendar\} \/>\s*<\/div>\s*<\/div>\s*\);\s*\}/);
});
