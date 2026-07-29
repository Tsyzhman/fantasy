import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const userPlayerSurfaces = [
  ["../../components/machete/MachetePlayerTable.tsx", 1],
  ["../../app/baltika/players/page.tsx", 2],
  ["../../app/baltika/leagues/[leagueId]/teams/[teamId]/page.tsx", 3],
  ["../../components/machete/FantasySquadPlanner.tsx", 8],
  ["../../components/compare/player-compare.tsx", 1],
  ["../../app/compare/page.tsx", 2],
  ["../../components/players/player-watchlist.tsx", 1],
  ["../../components/ui/player-hover-card.tsx", 1],
  ["../../components/mixerr/ShotMapExplorer.tsx", 1],
  ["../../app/mixerr/page.tsx", 2],
  ["../../app/page.tsx", 1]
] as const;

test("all user-facing player tables and visuals use the shared compact display helper", () => {
  for (const [relativePath, expectedCalls] of userPlayerSurfaces) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const callCount = source.match(/compactPlayerDisplayName\(/g)?.length ?? 0;
    assert.match(source, /@\/lib\/players\/display-name/, `${relativePath} must import the shared helper`);
    assert.equal(callCount, expectedCalls, `${relativePath} must compact every intended player-name visual`);
  }
});

test("legacy surface-specific player-name compactors are removed", () => {
  for (const [relativePath] of userPlayerSurfaces) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /function compact(?:Squad)?PlayerName\(/, relativePath);
  }
});
