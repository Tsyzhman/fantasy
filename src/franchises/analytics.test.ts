/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#acceptance */
import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, parseFilters, type Fact, type Snapshot } from "./analytics";
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
    { slug: "a", round: 1, finished: true, cutoff: null },
    { slug: "a", round: 2, finished: true, cutoff: null },
    { slug: "b", round: 1, finished: true, cutoff: null },
  ],
  squads,
  purchases: [],
  xfoExamples: [],
  freeze: { events: [], basis: [] },
  checks: {},
});
test("equal league weights and the inclusive round range", () => {
  const s = snapshot([
    fact(1, "a", 1, 10),
    fact(1, "a", 2, 30),
    fact(1, "b", 1, 80),
  ]);
  assert.equal(
    aggregate(s, { from: 1, to: 2, leagues: [], completed: false })
      .franchises[0].metrics.own,
    50,
  );
  const selected = aggregate(s, {
    from: 2,
    to: 2,
    leagues: ["a"],
    completed: false,
  });
  assert.equal(selected.squads, 1);
  assert.equal(selected.franchises[0].metrics.own, 30);
  assert.equal(
    aggregate(s, { from: 5, to: 8, leagues: [], completed: false }).squads,
    0,
  );
});
test("rounds 1–2 include each league independently, including leagues without complete xFO", () => {
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
  const result = aggregate(s, { from: 1, to: 2, leagues: [], completed: true });
  assert.equal(result.rounds, 4);
  assert.equal(result.squads, 4);
  assert.deepEqual(
    result.byLeague.map((r) => [r.name, r.count, r.xfoComplete, r.metrics.own]),
    [
      ["Чемпионшип", 2, 0, 15],
      ["Турция", 2, 0, 35],
    ],
  );
});
test("legacy and base-XI scoring stay distinguishable during snapshot replacement", () => {
  const s = snapshot([fact(1, "a", 1, 10)]);
  const filters = { from: 1, to: 2, leagues: [], completed: false };
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
  const r = aggregate(s, { from: 1, to: 2, leagues: [], completed: false });
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
  const r = aggregate(s, { from: 1, to: 1, leagues: [], completed: false });
  assert.equal(r.freezes[0].rounds, 1);
  assert.equal(r.freezes[0].frequency, 100);
  assert.equal(r.freezes[0].gain, 10);
  const all = aggregate(s, { from: 1, to: 2, leagues: [], completed: false });
  assert.equal(all.freezes[0].completed, 1);
  assert.equal(all.freezes[0].gain, 10);
});
test("reject bad bounds, unrecognized leagues and previous seasons", () => {
  for (const q of [
    "from=5&to=2",
    "from=-1",
    "to=61",
    "from=NaN",
    "league=other",
    "season=2025/2026",
  ])
    assert.throws(() => parseFilters(new URLSearchParams(q), { a: "A" }));
  assert.deepEqual(
    parseFilters(new URLSearchParams("from=2&to=5&league=a&league=a"), {
      a: "A",
    }),
    { from: 2, to: 5, leagues: ["a"], completed: false },
  );
});

test("current forecasts describe only the last selected lineup, historical values retain the full range", () => {
  const s = snapshot([
    fact(1, "a", 1, 10, { team: "same", current_fo: 2, fo_xi_pct: 20 }),
    fact(1, "a", 2, 30, { team: "same", current_fo: 10, fo_xi_pct: 80 }),
  ]);
  const result = aggregate(s, { from: 1, to: 2, leagues: [], completed: false })
    .franchises[0];
  assert.equal(result.metrics.current_fo, 10);
  assert.equal(result.metrics.fo_xi_pct, 50);
});
