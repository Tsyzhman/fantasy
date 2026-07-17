import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const squadsRouteSource = normalizedSource(new URL("./route.ts", import.meta.url));
const exportRouteSource = normalizedSource(new URL("./export/route.ts", import.meta.url));

test("squad GET rejects non-allowlisted league seasons before loading the player pool", () => {
  const source = handlerSource(squadsRouteSource, "GET", "POST");
  assertGuardBeforeDownstreamLoad(
    source,
    "const leagueSeason = await prisma.leagueSeason.findUnique",
    "!isFantasySquadLeague({ providerLeagueId: String(leagueSeason.leagueId) })",
    "loadCachedFantasySquadPlayerPool"
  );
  assertNotFoundWithoutLeagueDisclosure(source);
});

test("squad POST rejects non-allowlisted league seasons before loading planner data", () => {
  const source = handlerSource(squadsRouteSource, "POST", "DELETE");
  assertGuardBeforeDownstreamLoad(
    source,
    "const leagueSeason = await prisma.leagueSeason.findUnique",
    "!isFantasySquadLeague({ providerLeagueId: String(leagueSeason.leagueId) })",
    "loadFantasySquadPlannerData"
  );
  assertNotFoundWithoutLeagueDisclosure(source);
});

test("squad export rejects non-allowlisted league seasons before loading planner data", () => {
  const source = handlerSource(exportRouteSource, "GET");
  assertGuardBeforeDownstreamLoad(
    source,
    "const league = await loadSharedLeagueSeason",
    "!isFantasySquadLeague(league)",
    "loadFantasySquadPlannerData"
  );
  assertNotFoundWithoutLeagueDisclosure(source);
});

function normalizedSource(url: URL) {
  return readFileSync(url, "utf8").replace(/\s+/g, " ");
}

function handlerSource(source: string, method: string, nextMethod?: string) {
  const start = source.indexOf(`export const ${method} =`);
  const end = nextMethod ? source.indexOf(`export const ${nextMethod} =`, start + 1) : source.length;
  assert.ok(start >= 0, `${method} handler is missing`);
  assert.ok(end > start, `${method} handler boundary is missing`);
  return source.slice(start, end);
}

function assertGuardBeforeDownstreamLoad(source: string, lookup: string, guard: string, downstreamLoad: string) {
  const lookupIndex = source.indexOf(lookup);
  const guardIndex = source.indexOf(guard);
  const downstreamIndex = source.indexOf(downstreamLoad, guardIndex + guard.length);

  assert.ok(lookupIndex >= 0, `league-season lookup is missing: ${lookup}`);
  assert.ok(guardIndex > lookupIndex, `allowlist guard must run after league-season lookup: ${guard}`);
  assert.ok(downstreamIndex > guardIndex, `allowlist guard must run before ${downstreamLoad}`);
}

function assertNotFoundWithoutLeagueDisclosure(source: string) {
  assert.match(
    source,
    /if \([^)]*(?:!leagueSeason|!league)[\s\S]*?!isFantasySquadLeague[\s\S]*?\) (?:\{ )?return jsonError\("NOT_FOUND", "League season not found\.", 404\)/
  );
}
