import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../app/machete/leagues/[leagueId]/teams/[teamId]/page.tsx", import.meta.url), "utf8");

test("team starting-XI table attaches verified Sports.ru names to FotMob roster rows", () => {
  assert.match(pageSource, /sportsRuDisplayNamesByPlayerId\(sportsRuMappings\)/);
  assert.match(pageSource, /sportsName: sportsNamesByPlayerId\.get\(macheteTeamRowPlayerId\(player\.id\)/);
});
