import assert from "node:assert/strict";
import test from "node:test";
import { planSportsTrendsCycle } from "./planner";
import { matchSportsTrendContest } from "./collector";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#acceptance
 */
test("cycle planning skips fresh sources, deduplicates and bounds the batch", () => {
  const now = new Date("2026-09-25T08:00:00.000Z");
  const plan = planSportsTrendsCycle({
    discovered: ["a", "b", "a", "c", "d", "e"],
    existing: [{ canonicalUrl: "b", fetchedAt: new Date("2026-09-25T07:50:00.000Z") }],
    now,
    refreshAfterMs: 30 * 60 * 1000,
    maxArticles: 2
  });
  assert.deepEqual(plan.toFetch, ["a", "c"]);
  assert.equal(plan.skippedFresh, 1);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.overflow, 2);
});

test("stale sources are fetched again on the next cycle", () => {
  const now = new Date("2026-09-25T08:00:00.000Z");
  const plan = planSportsTrendsCycle({
    discovered: ["a"],
    existing: [{ canonicalUrl: "a", fetchedAt: new Date("2026-09-25T06:00:00.000Z") }],
    now,
    refreshAfterMs: 30 * 60 * 1000,
    maxArticles: 20
  });
  assert.deepEqual(plan.toFetch, ["a"]);
});

test("tournament hints resolve a single contest and reject ambiguity", () => {
  const candidates = [
    { id: "1", name: "Англия", season: "2026/2027" },
    { id: "2", name: "Лига чемпионов", season: "2026/2027" },
    { id: "3", name: "Лига Европы", season: "2026/2027" }
  ];
  assert.equal(matchSportsTrendContest("АПЛ", candidates)?.id, "1");
  assert.equal(matchSportsTrendContest("Лига чемпионов", candidates)?.id, "2");
  assert.equal(matchSportsTrendContest("ЧМ", candidates), null);
  assert.equal(matchSportsTrendContest(null, candidates), null);
});

test("English Sports contest names resolve hints and stay unambiguous", () => {
  const candidates = [
    { id: "champ", name: "Sports.ru Championship", season: "2026/2027" },
    { id: "cl", name: "Sports.ru Champions League", season: "2026/2027" },
    { id: "eredivisie", name: "Sports.ru Eredivisie", season: "2026/2027" },
    { id: "laliga-a", name: "Sports.ru LaLiga", season: "2026/2027" },
    { id: "england", name: "English Premier League", season: "2026/2027" },
    { id: "russia", name: "Russian Premier League", season: "2026/2027" }
  ];
  assert.equal(matchSportsTrendContest("Чемпионшип", candidates)?.id, "champ");
  assert.equal(matchSportsTrendContest("Лига чемпионов", candidates)?.id, "cl");
  assert.equal(matchSportsTrendContest("Нидерланды", candidates)?.id, "eredivisie");
  assert.equal(matchSportsTrendContest("Ла Лига", candidates)?.id, "laliga-a");
  assert.equal(matchSportsTrendContest("АПЛ", candidates)?.id, "england");
  assert.equal(matchSportsTrendContest("РПЛ", candidates)?.id, "russia");
  const duplicatedPremier = [
    { id: "england", name: "Sports.ru Premier League", season: "2026/2027" },
    { id: "russia", name: "Sports.ru Premier League", season: "2026/2027" }
  ];
  assert.equal(matchSportsTrendContest("АПЛ", duplicatedPremier), null);
});
