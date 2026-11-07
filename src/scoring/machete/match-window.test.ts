import assert from "node:assert/strict";
import test from "node:test";

import { fixtureInMatchWindow, fixtureSyncSeasons, matchWindowModeValue, parseMacheteMatchWindow, previousSeasonLabel } from "./match-window";

test("parses and serializes last 3 team match window", () => {
  const window = parseMacheteMatchWindow({ mode: "last3" });

  assert.deepEqual(window, { kind: "last", matches: 3 });
  assert.equal(matchWindowModeValue(window), "last3");
});

test("day windows filter fixtures against an explicit reference date", () => {
  const referenceDate = new Date("2026-07-20T12:00:00.000Z");
  const window = { kind: "days", days: 365 } as const;

  assert.equal(fixtureInMatchWindow({ kickoffAt: new Date("2025-07-21T12:00:00.000Z") }, window, null, null, referenceDate), true);
  assert.equal(fixtureInMatchWindow({ kickoffAt: new Date("2025-07-19T12:00:00.000Z") }, window, null, null, referenceDate), false);
  assert.equal(fixtureInMatchWindow({ kickoffAt: new Date("2026-07-21T12:00:00.000Z") }, window, null, null, referenceDate), false);
  assert.equal(matchWindowModeValue(window), "days365");
});

test("match window parser supports presets and custom match counts", () => {
  assert.deepEqual(parseMacheteMatchWindow({ mode: "last10" }), { kind: "last", matches: 10 });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "custom", customMatches: "7" }), { kind: "last", matches: 7 });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "custom", customMatches: "200" }), { kind: "last", matches: 50 });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "previous" }), { kind: "season", offset: -1 });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "all" }), { kind: "all" });
  assert.deepEqual(parseMacheteMatchWindow({ mode: "custom", customMatches: "nope" }), { kind: "last", matches: 5 });
});

test("previous season labels support domestic seasons and World Cup tournaments", () => {
  assert.equal(previousSeasonLabel("2025/26", "48"), "2024/25");
  assert.equal(previousSeasonLabel("2025/2026", "48"), "2024/2025");
  assert.equal(previousSeasonLabel("2025/26", "77"), "2022");
  assert.deepEqual(fixtureSyncSeasons("2025/26", "48"), ["2025/26", "2024/25"]);
  assert.deepEqual(fixtureSyncSeasons("2025/26", "77"), ["2025/26", "2022"]);
});
