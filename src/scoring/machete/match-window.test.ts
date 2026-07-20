import assert from "node:assert/strict";
import test from "node:test";

import { fixtureInMatchWindow, matchWindowModeValue, parseMacheteMatchWindow } from "./match-window";

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
