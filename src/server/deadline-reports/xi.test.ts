/** @spec spec://modules/telegram/FEAT-007-deadline-assistant#signals */
import assert from "node:assert/strict";
import test from "node:test";
import { deadlineXiSignal, type DeadlineXiFixture } from "./xi";

const now = new Date("2026-10-09T05:15:00Z");
const kickoff = "2026-10-10T10:00:00Z";
const fixture = (homeTeamId: string, awayTeamId: string, time = kickoff): DeadlineXiFixture =>
  ({ homeTeamId, awayTeamId, kickoffAt: new Date(time) });
const metadata = (overrides: Record<string, unknown> = {}) => ({ probableLineup: {
  source: "SORAREINSIDE", sourceKickoff: kickoff,
  appliedAt: "2026-10-09T05:12:00Z", fetchedAt: "2026-10-09T05:10:00Z", ...overrides
} });
const signal = (data: unknown, fixtures = [fixture("1", "2")]) => deadlineXiSignal({
  metadata: data, teamId: "1", fixtures, now, inXi: false
});

test("missing or foreign-source evidence is unavailable rather than stale", () => {
  for (const data of [null, {}, metadata({ source: "OTHER" }), metadata({ sourceKickoff: "invalid" })]) {
    assert.equal(signal(data).available, false);
    assert.equal(signal(data).stale, false);
  }
});

test("the same kickoff for another club does not prove fixture coverage", () => {
  assert.equal(signal(metadata(), [fixture("3", "4")]).coveredFixtures, 0);
  assert.equal(signal(metadata(), [fixture("3", "4"), fixture("2", "1")]).coveredFixtures, 1);
});

test("one lineup does not cover two matches or an ambiguous fixture", () => {
  assert.equal(signal(metadata(), [fixture("1", "2"), fixture("1", "3", "2026-10-13T10:00:00Z")]).coveredFixtures, 1);
  assert.equal(signal(metadata(), [fixture("1", "2"), fixture("1", "3", "2026-10-10T12:00:00Z")]).available, false);
});

test("a newly checked past fixture remains inapplicable", () => {
  const oldKickoff = "2026-10-08T10:00:00Z";
  assert.equal(signal(metadata({ sourceKickoff: oldKickoff }), [fixture("1", "2", oldKickoff)]).available, false);
});

test("successful unchanged checks refresh freshness; genuinely old or undated evidence remains stale", () => {
  assert.equal(signal(metadata({ fetchedAt: "2026-10-01T05:10:00Z" })).stale, false);
  const old = signal(metadata({ appliedAt: "2026-10-09T02:00:00Z", fetchedAt: "2026-10-09T02:00:00Z" }));
  assert.equal(old.available, true);
  assert.equal(old.stale, true);
  assert.equal(signal(metadata({ appliedAt: null, fetchedAt: null })).stale, true);
});
