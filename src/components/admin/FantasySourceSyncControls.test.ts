import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controls = readFileSync(new URL("./FantasySourceSyncControls.tsx", import.meta.url), "utf8");

test("admin ingestion controls expose one probable-lineup button per allowlisted league", () => {
  for (const source of ["epl", "serie-a", "bundesliga", "ligue-1"]) {
    assert.match(controls, new RegExp(`sourceKey: "${source}"`));
  }
  assert.match(controls, /probable-lineups\/\$\{sourceKey\}\/start/);
  assert.match(controls, /Обновить составы АПЛ/);
  assert.match(controls, /Обновить составы Серии A/);
  assert.match(controls, /Обновить составы Бундеслиги/);
});

test("probable-lineup controls report per-source applied, unchanged, skipped, and failed teams", () => {
  assert.match(controls, /sourceResult\.appliedTeams/);
  assert.match(controls, /sourceResult\.unchangedTeams/);
  assert.match(controls, /sourceResult\.skippedTeams/);
  assert.match(controls, /sourceResult\.failedTeams/);
});
