/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#data */
import test from "node:test";
import assert from "node:assert/strict";
import type { Snapshot } from "@/franchises/analytics";
import { validateSnapshot } from "./snapshot";

const fixture = (): Snapshot => ({
  version: 2,
  personalHistory: true,
  season: "2026/2027",
  generated: "2026-10-03T12:00:00Z",
  acquisition: { from: "2026-10-03T12:00:00Z", to: "2026-10-03T12:00:00Z" },
  franchises: [{ id: 5, name: "Мачете" }, { id: -1, name: "шизы", kind: "virtual" }],
  leagues: { a: "Англия" },
  rounds: [{ slug: "a", round: 1, finished: true, cutoff: "2026-10-03T10:00:00Z" }],
  squads: [{ franchise: 5, manager: "m", team: "123", slug: "a", round: 1 }, { franchise: -1, manager: "m", team: "123", slug: "a", round: 1, personal_only: true }],
  purchases: [], xfoExamples: [], freeze: { events: [], basis: [] }, checks: {},
});

test("one source may belong to two report groups without duplicate observations", () => {
  const s = fixture();
  assert.equal(validateSnapshot(s), s);
  s.squads.push({ ...s.squads[0] });
  assert.throws(() => validateSnapshot(s), /Duplicate squad/);
});

test("invalid histories, unknown groups, duplicate rounds and excessive payloads fail publication", () => {
  const unknown = fixture(); unknown.squads[0].franchise = 99;
  assert.throws(() => validateSnapshot(unknown), /Unknown squad scope/);
  const duplicate = fixture(); duplicate.rounds.push(duplicate.rounds[0]);
  assert.throws(() => validateSnapshot(duplicate), /Duplicate round/);
  const legacy = fixture(); legacy.personalHistory = false;
  assert.throws(() => validateSnapshot(legacy), /Unsupported/);
  const oversized = fixture(); oversized.squads.length = 250001;
  assert.throws(() => validateSnapshot(oversized), /exceeds bounds/);
});
