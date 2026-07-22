import assert from "node:assert/strict";
import test from "node:test";

import { formatCompactScore, formatDateTime, NULL_GLYPH } from "./format";

test("formatDateTime includes date, hours, and minutes in Moscow time", () => {
  assert.equal(formatDateTime(new Date("2026-07-22T11:05:42.000Z")), "22.07.2026, 14:05");
});

test("formatDateTime keeps an unknown starting-XI change visibly empty", () => {
  assert.equal(formatDateTime(null), NULL_GLYPH);
});

test("formatCompactScore keeps narrow squad-card values readable", () => {
  assert.equal(formatCompactScore(3.61), "3.6");
  assert.equal(formatCompactScore(9.54), "9.5");
  assert.equal(formatCompactScore(12.76), "13");
  assert.equal(formatCompactScore(null), NULL_GLYPH);
  assert.equal(formatCompactScore(null, "0"), "0");
});
