import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const plannerSource = readFileSync(new URL("./squad_planner.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/machete/squad/page.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("../components/app-header.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../components/machete/MacheteShell.tsx", import.meta.url), "utf8");

test("initial squad render defers the all-player formula projection", () => {
  assert.match(pageSource, /deferFormulaProjections: true/);
  assert.match(plannerSource, /deferFormulaProjections\s*\? Promise\.resolve\(\[\]\)/);
  assert.match(plannerSource, /options\?\.deferFormulaProjections\s*\? emptyComponentProjectionIndex\(\)/);
});

test("navigation prefetches only the link the user intends to open", () => {
  for (const source of [headerSource, shellSource]) {
    assert.match(source, /prefetch=\{false\}/);
    assert.match(source, /onPointerEnter=\{\(\) => router\.prefetch\(/);
    assert.match(source, /useLinkStatus\(\)/);
  }
});

test("shared fixture and full player-pool work is coalesced for five minutes", () => {
  assert.match(plannerSource, /fantasyPlayerPoolCacheTtlMs = 5 \* 60_000/);
  assert.match(plannerSource, /upcomingRoundFixturesCacheTtlMs = 5 \* 60_000/);
  assert.match(plannerSource, /upcomingRoundFixturesCache\.getOrCreate/);
});
