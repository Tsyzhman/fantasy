import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatAlternativeScore } from "@/lib/format";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("forecast table distinguishes missing Alt while legacy score displays retain zero fallback", () => {
  assert.equal(formatAlternativeScore(null), "0");
  assert.equal(formatAlternativeScore(undefined), "0");
  assert.equal(formatAlternativeScore(1.234), "1.23");

  assert.match(read("./machete/PlayerPool.tsx"), /formatAlternativeScore\(nextAlternativeFantasyPoints\(player\)\)/);
  assert.match(read("./machete/MachetePlayerTable.tsx"), /ScoreHeatCell value=\{numberOrNull\(value\)\}/);
  assert.match(read("./ui/player-hover-card.tsx"), /value=\{player\.altFp \?\? 0\}/);
  assert.match(read("../app/baltika/players/page.tsx"), /value=\{player\.alternativeScore \?\? 0\}/);
  assert.match(read("../app/baltika/leagues/[leagueId]/teams/[teamId]/page.tsx"), /formatScore\(player\.alternativeScore \?\? 0\)/);
  assert.match(read("../app/compare/page.tsx"), /metric\.key === "alternativeScore" \? value \?\? 0 : value/);
});
