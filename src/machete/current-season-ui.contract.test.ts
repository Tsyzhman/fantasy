import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const squadPage = readFileSync(new URL("../app/machete/squad/page.tsx", import.meta.url), "utf8");
const teamPage = readFileSync(new URL("../app/machete/leagues/[leagueId]/teams/[teamId]/page.tsx", import.meta.url), "utf8");
const teamCard = readFileSync(new URL("../components/machete/MacheteTeamCard.tsx", import.meta.url), "utf8");

test("squad planner always uses the current league season without a season control", () => {
  assert.match(squadPage, /loadSharedLeagueOptions\(prisma\)/);
  assert.doesNotMatch(squadPage, /params\.season/);
  assert.doesNotMatch(squadPage, /name="season"/);
  assert.doesNotMatch(squadPage, /selectPlannerSeason/);
});

test("team page keeps season selection inside Stats window only", () => {
  assert.match(teamPage, /loadSharedLeagueSeason\(prisma, leagueId\)/);
  assert.doesNotMatch(teamPage, /resolvedSearchParams\.season/);
  assert.doesNotMatch(teamPage, /name="season"/);
  assert.match(teamPage, /name="matchWindow"/);
  assert.match(teamPage, /value="current"/);
  assert.match(teamPage, /value="previous"/);
  assert.doesNotMatch(teamCard, /\?season=/);
});
