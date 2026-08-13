import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sportsPage = readFileSync(new URL("../../squad/page.tsx", import.meta.url), "utf8");
const fplPage = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const fplApi = readFileSync(new URL("../../../api/machete/fpl/squad/route.ts", import.meta.url), "utf8");

test("FPL has a separate fixed frontend and API context", () => {
  assert.doesNotMatch(sportsPage, /name="provider"/);
  assert.match(sportsPage, /redirect\(`\/machete\/fpl\/squad/);
  assert.match(fplPage, /mode="FPL"/);
  assert.match(fplApi, /url\.searchParams\.set\("provider", FPL_PROVIDER\)/);
  assert.match(fplApi, /url\.searchParams\.set\("leagueId", String\(FPL_LEAGUE_ID\)\)/);
  assert.match(fplApi, /url\.searchParams\.set\("season", FPL_SEASON\)/);
});
