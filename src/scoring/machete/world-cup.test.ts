import assert from "node:assert/strict";
import test from "node:test";

import { shouldIgnoreProviderSeasonStats } from "./world-cup";

test("World Cup 2026 provider season stats are ignored for seeded and FotMob season formats", () => {
  for (const season of [null, undefined, "2026", "2025/26", "2025/2026", "2026/27", "2026/2027"]) {
    assert.equal(shouldIgnoreProviderSeasonStats("77", season), true, String(season));
  }
});

test("non World Cup leagues keep provider season stats", () => {
  assert.equal(shouldIgnoreProviderSeasonStats("48", "2025/26"), false);
  assert.equal(shouldIgnoreProviderSeasonStats(null, "2026"), false);
});
