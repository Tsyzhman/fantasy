/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#acceptance */
import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, parseFilters, roundDate, type Fact, type Snapshot } from "./analytics";
const fact = (
  franchise: number,
  slug: string,
  round: number,
  own: number,
  extra: Record<string, unknown> = {},
): Fact => ({
  franchise,
  slug,
  round,
  team: `${franchise}-${slug}-${round}`,
  manager: "m" + franchise,
  own,
  own_cohort_gap: own,
  cap_gap: own,
  buy_delta_gap: own,
  n_buy: 1,
  finished: true,
  xfo_known: 10,
  xfo_complete: false,
  xfo: null,
  ...extra,
});
const snapshot = (squads: Fact[]): Snapshot => ({
  version: 1,
  season: "2026/2027",
  generated: "2026-09-21T12:00:00Z",
  acquisition: { from: "2026-09-20T12:00:00Z", to: "2026-09-21T12:00:00Z" },
  franchises: [
    { id: 1, name: "А" },
    { id: 2, name: "Б" },
  ],
  leagues: { a: "Англия", b: "Италия" },
  rounds: [
    { slug: "a", round: 1, finished: true, cutoff: "2026-07-01T10:00:00Z" },
    { slug: "a", round: 2, finished: true, cutoff: "2026-07-02T10:00:00Z" },
    { slug: "b", round: 1, finished: true, cutoff: "2026-07-01T10:00:00Z" },
  ],
  squads,
  purchases: [],
  xfoExamples: [],
  freeze: { events: [], basis: [] },
  checks: {},
});
test("equal league weights and the inclusive calendar range", () => {
  const s = snapshot([
    fact(1, "a", 1, 10),
    fact(1, "a", 2, 30),
    fact(1, "b", 1, 80),
  ]);
  assert.equal(
    aggregate(s, { from: "2026-07-01", to: "2026-07-02", leagues: [], completed: false })
      .franchises[0].metrics.own,
    50,
  );
  const selected = aggregate(s, {
    from: "2026-07-02",
    to: "2026-07-02",
    leagues: ["a"],
    completed: false,
  });
  assert.equal(selected.squads, 1);
  assert.equal(selected.franchises[0].metrics.own, 30);
  assert.equal(
    aggregate(s, { from: "2026-07-05", to: "2026-07-08", leagues: [], completed: false }).squads,
    0,
  );
});
test("calendar dates include different round numbers across leagues without complete xFO", () => {
  const s = snapshot([
    fact(1, "championship", 1, 10),
    fact(1, "championship", 2, 20),
    fact(1, "turkey", 1, 30),
    fact(1, "turkey", 2, 40),
    fact(1, "turkey", 3, 90),
  ]);
  s.leagues = { championship: "Чемпионшип", turkey: "Турция" };
  s.rounds = [
    {
      slug: "championship",
      round: 1,
      finished: true,
      cutoff: "2026-08-14T19:00:00Z",
    },
    {
      slug: "championship",
      round: 2,
      finished: true,
      cutoff: "2026-08-22T11:30:00Z",
    },
    {
      slug: "turkey",
      round: 1,
      finished: true,
      cutoff: "2026-08-01T17:00:00Z",
    },
    {
      slug: "turkey",
      round: 2,
      finished: true,
      cutoff: "2026-08-08T17:00:00Z",
    },
    {
      slug: "turkey",
      round: 3,
      finished: true,
      cutoff: "2026-08-22T17:00:00Z",
    },
  ];
  const result = aggregate(s, { from: "2026-08-22", to: "2026-08-22", leagues: [], completed: true });
  assert.equal(result.rounds, 2);
  assert.equal(result.squads, 2);
  assert.deepEqual(
    result.byLeague.map((r) => [r.name, r.count, r.xfoComplete, r.metrics.own]),
    [
      ["Чемпионшип", 1, 0, 20],
      ["Турция", 1, 0, 90],
    ],
  );
});
test("legacy and base-XI scoring stay distinguishable during snapshot replacement", () => {
  const s = snapshot([fact(1, "a", 1, 10)]);
  const filters = { from: "2026-07-01", to: "2026-07-02", leagues: [], completed: false };
  assert.equal(aggregate(s, filters).xfoCaptainMultiplier, 2);
  s.xfoCaptainMultiplier = 1;
  assert.equal(aggregate(s, filters).xfoCaptainMultiplier, 1);
});
test("missing model / xFO values do not become a zero or rank", () => {
  const s = snapshot([
    fact(1, "a", 1, 10, { buy_delta_gap: null }),
    fact(2, "a", 1, 20, {
      xfo: 80,
      xfo_complete: true,
      xfo_known: 11,
      xfo_actual: 83,
      xfo_gap: 3,
    }),
  ]);
  const r = aggregate(s, { from: "2026-07-01", to: "2026-07-02", leagues: [], completed: false });
  const a = r.franchises.find((f) => f.franchise === 1)!;
  assert.equal(a.rank, null);
  assert.equal(a.metrics.xfo, null);
  assert.equal(a.xfoComplete, 0);
  assert.equal(r.franchises.find((f) => f.franchise === 2)!.metrics.xfo, 80);
});
test("freeze rate uses filtered denominator and excludes current outcomes", () => {
  const s = snapshot([fact(1, "a", 1, 10)]);
  s.freeze.basis = [
    { franchise: 1, slug: "a", round: 1, n_active: 6 },
    { franchise: 1, slug: "a", round: 2, n_active: 6 },
  ];
  s.freeze.events = [
    {
      franchise: 1,
      slug: "a",
      round: 1,
      n: 1,
      valid: true,
      finished: true,
      board_verified: true,
      gain: 10,
      source: "",
      frozen: [],
      substitutes: [],
    },
    {
      franchise: 1,
      slug: "a",
      round: 2,
      n: 1,
      valid: true,
      finished: false,
      board_verified: true,
      gain: -99,
      source: "",
      frozen: [],
      substitutes: [],
    },
  ];
  const r = aggregate(s, { from: "2026-07-01", to: "2026-07-01", leagues: [], completed: false });
  assert.equal(r.freezes[0].rounds, 1);
  assert.equal(r.freezes[0].frequency, 100);
  assert.equal(r.freezes[0].gain, 10);
  const all = aggregate(s, { from: "2026-07-01", to: "2026-07-02", leagues: [], completed: false });
  assert.equal(all.freezes[0].completed, 1);
  assert.equal(all.freezes[0].gain, 10);
});
test("reject bad bounds, unrecognized leagues and previous seasons", () => {
  for (const q of [
    "from=5&to=2",
    "from=-1",
    "to=61",
    "from=NaN",
    "from=2026-02-30",
    "from=2027-02-29",
    "from=2026-9-01",
    "from=2026-10-03&to=2026-10-02",
    "to=",
    "league=other",
    "season=2025/2026",
  ])
    assert.throws(() => parseFilters(new URLSearchParams(q), { a: "A" }));
  assert.deepEqual(
    parseFilters(new URLSearchParams("from=2026-07-02&to=2026-07-05&league=a&league=a"), {
      a: "A",
    }),
    { from: "2026-07-02", to: "2026-07-05", leagues: ["a"], completed: false },
  );
});

test("Moscow dates include the whole final day and normalize legacy naive UTC cutoffs", () => {
  assert.equal(roundDate({ slug: "a", round: 1, finished: true, cutoff: "2026-09-30T21:30:00" }), "2026-10-01");
  assert.equal(roundDate({ slug: "a", round: 1, finished: true, cutoff: "2026-10-01T23:59:00+03:00" }), "2026-10-01");
  assert.equal(roundDate({ slug: "a", round: 1, finished: true, cutoff: null }), null);
  const s = snapshot([fact(1, "a", 1, 10), fact(1, "a", 2, 90)]);
  s.rounds[0].cutoff = "2026-09-30T21:30:00";
  s.rounds[1].cutoff = "2026-10-01T21:00:00Z";
  const result = aggregate(s, { from: "2026-10-01", to: "2026-10-01", leagues: ["a"], completed: true });
  assert.equal(result.squads, 1);
  assert.equal(result.franchises[0].metrics.own, 10);
});

test("personal style and xFO comparisons include reserve, frozen and personal-only rounds", () => {
  const complete = { xfo_complete: true, xfo_known: 11 };
  const s = snapshot([
    fact(1, "a", 1, 10, { ...complete, active: true, xfo: 20, xfo_actual: 25, xfo_gap: 5 }),
    fact(1, "a", 2, 70, { ...complete, active: false, frozen: true, xfo: 80, xfo_actual: 85, xfo_gap: 5 }),
    fact(1, "b", 1, 100, { ...complete, personal_only: true, xfo: 100, xfo_actual: 105, xfo_gap: 5 }),
  ]);
  const r = aggregate(s, { from: "2026-07-01", to: "2026-07-02", leagues: [], completed: true });
  const manager = r.managers.find((m) => m.franchise === 1)!;
  assert.equal(manager.count, 3);
  assert.equal(manager.reserveRounds, 1);
  assert.equal(manager.personalRounds, 1);
  assert.equal(manager.metrics.own, 70);
  assert.equal(manager.metrics.xfo, 75);
  assert.equal(manager.metrics.xfo_actual, 80);
  assert.equal(manager.xfoComplete, 3);
  assert.equal(r.franchises[0].count, 2);
  assert.equal(r.franchises[0].metrics.own, 40);
  assert.equal(r.managerSquads, 3);
  assert.equal(r.squads, 2);
});

test("virtual group aggregates personal histories and has no freeze denominator", () => {
  const s = snapshot([fact(-1, "a", 1, 10, { personal_only: true })]);
  s.franchises.push({ id: -1, name: "шизы", kind: "virtual" });
  s.personalHistory = true;
  const filters = { from: "2026-07-01", to: "2026-07-02", leagues: [], completed: false };
  const r = aggregate(s, filters);
  assert.equal(r.franchises.find((f) => f.franchise === -1)!.count, 1);
  assert.equal(r.managers[0].virtual, true);
  assert.equal(r.freezes.some((f) => f.id === -1), false);
  assert.equal(r.personalHistory, true);
  const empty = aggregate(s, { ...filters, from: "2027-01-01", to: "2027-01-02" });
  assert.equal(empty.squads, 0);
  assert.equal(empty.franchises.find((f) => f.franchise === -1)!.count, 0);
});

test("unavailable lineups remain in personal history and coverage without invented metrics", () => {
  const s = snapshot([
    fact(1, "a", 1, 40, { xfo_complete: true, xfo_known: 11, xfo: 60, xfo_actual: 65 }),
    {
      franchise: 1, slug: "a", round: 2, team: "missing", manager: "m1",
      personal_only: true, lineup_missing: true, finished: true,
      xfo_complete: false, xfo_known: 0, n_buy: 0,
    },
  ]);
  const result = aggregate(s, { from: "2026-07-01", to: "2026-07-02", leagues: [], completed: true });
  const manager = result.managers[0];
  assert.equal(manager.count, 2);
  assert.equal(manager.missingLineups, 1);
  assert.equal(manager.xfoEligible, 2);
  assert.equal(manager.xfoComplete, 1);
  assert.equal(manager.xfoCoverage, 50);
  assert.equal(manager.metrics.xfo, 60);
  assert.equal(manager.metrics.own, 40);
  assert.equal(result.franchises[0].missingLineups, 0);
});

test("franchise purchase explanations keep tournament scope while virtual groups use personal rounds", () => {
  const s = snapshot([]);
  s.franchises.push({id: -1, name: "шизы", kind: "virtual"});
  const board = fact(1, "a", 1, 10, {h2h_id: "board", triple_model_low: 1});
  const personal = fact(1, "a", 1, 10, {h2h_id: "personal", triple_model_low: 1, personal_only: true});
  const virtual = fact(-1, "a", 1, 10, {h2h_id: "virtual", triple_model_low: 1, personal_only: true});
  s.purchases = [board, personal, virtual];
  s.xfoExamples = [board, personal, virtual];
  const result = aggregate(s, {from: "2026-07-01", to: "2026-07-02", leagues: [], completed: false});
  assert.equal(result.buys, 2);
  assert.deepEqual(result.models.find(f => f.id === 1)!.examples.map(r => r.h2h_id), ["board"]);
  assert.deepEqual(result.models.find(f => f.id === -1)!.examples.map(r => r.h2h_id), ["virtual"]);
  assert.deepEqual(result.xfoExamples.map(r => r.h2h_id), ["board", "virtual"]);
});

test("current forecasts describe only the last selected lineup, historical values retain the full range", () => {
  const s = snapshot([
    fact(1, "a", 1, 10, { team: "same", current_fo: 2, fo_xi_pct: 20 }),
    fact(1, "a", 2, 30, { team: "same", current_fo: 10, fo_xi_pct: 80 }),
  ]);
  const result = aggregate(s, { from: "2026-07-01", to: "2026-07-02", leagues: [], completed: false })
    .franchises[0];
  assert.equal(result.metrics.current_fo, 10);
  assert.equal(result.metrics.fo_xi_pct, 50);
});
