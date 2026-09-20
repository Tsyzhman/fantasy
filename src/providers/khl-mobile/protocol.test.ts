/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#protocols */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseKhlProtocol } from "./protocol";
import { fetchKhlProtocol } from "./protocol-transport";
const html = readFileSync("src/providers/khl-mobile/fixtures/protocol-901980.html", "utf8");
const rest = readFileSync("src/providers/khl-mobile/fixtures/protocol-902038.json", "utf8");
test("real public REST protocol preserves exact times, attack, blocks, shifts and goalie saves", () => {
  const result = parseKhlProtocol(rest, "902038", "1436");
  assert.equal(result.rows.length, 43);
  assert.equal(result.attackTimeAvailable, true);
  const p = result.rows.find(r => r.officialPlayerId === "44956")!;
  assert.equal(p.toiSeconds, 1192); assert.equal(p.attackZoneSeconds, 241);
  assert.equal(p.ppToiSeconds, 0); assert.equal(p.pkToiSeconds, 33);
  assert.equal(p.shifts, 23); assert.equal(p.shotsOnGoal, 1);
  assert.equal(result.rows.find(r => r.officialPlayerId === "29048")!.blockedShots, 4);
  const goalie = result.rows.find(r => r.officialPlayerId === "22139")!;
  assert.equal(goalie.saves, 23); assert.equal(goalie.goalsAgainst, 1);
  assert.equal(goalie.shotsOnGoal, null); assert.equal(goalie.ppToiSeconds, null);
});
test("REST refuses empty success, wrong season/match, missing fields and duplicate players", () => {
  assert.throws(() => parseKhlProtocol('{"status":"success","data":{"teams":[]}}', "902038"), /RESPONSE_INVALID/);
  assert.throws(() => parseKhlProtocol(rest, "901980"), /MATCH_INVALID/);
  assert.throws(() => parseKhlProtocol(rest, "902038", "1369"), /MATCH_INVALID/);
  const d = JSON.parse(rest);
  delete d.data.teams.home.stats.def[0].tipp_avg;
  assert.throws(() => parseKhlProtocol(JSON.stringify(d), "902038"), /COLUMNS_INVALID/);
  const duplicate = JSON.parse(rest);
  duplicate.data.teams.home.stats.gk[0].id = duplicate.data.teams.visitor.stats.gk[0].id;
  assert.throws(() => parseKhlProtocol(JSON.stringify(duplicate), "902038"), /PLAYER_INVALID/);
});
test("real KHL protocol: 44 identities, match TOI and PP/PK, empty attack telemetry stays unknown", () => {
  const result = parseKhlProtocol(html, "901980");
  assert.equal(result.rows.length, 44);
  assert.equal(result.attackTimeAvailable, false);
  assert.ok(result.rows.every(r => r.attackZoneSeconds === null));
  const p = result.rows.find(p => p.officialPlayerId === "44956")!;
  assert.equal(p.name, "Грегуар Томас"); assert.equal(p.toiSeconds, 1250);
  assert.equal(p.ppToiSeconds, 365); assert.equal(p.pkToiSeconds, 44);
  assert.equal(p.assists, 1); assert.equal(p.shotsOnGoal, 0);
  assert.equal(result.rows.find(p => p.officialPlayerId === "28416")!.participationStatus, "DNP");
});
test("protocol rejects cross-match identity and a truncated group", () => {
  assert.throws(() => parseKhlProtocol(html, "901981"), /MATCH_INVALID/);
  assert.throws(() => parseKhlProtocol(html.replaceAll('data-name="toa_avg"', 'data-name="unknown_column"'), "901980"), /COLUMNS_INVALID/);
  const truncated = html.slice(0, html.lastIndexOf('<table>'));
  assert.throws(() => parseKhlProtocol(truncated, "901980"), /COVERAGE_INVALID/);
  assert.throws(() => parseKhlProtocol(html.replace('/players/28416/', '/players/22139/'), "901980"), /PLAYER_INVALID/);
});
test("a blocked HTTP source is surfaced and its body is not ingested", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("Access denied", { status: 403 });
    await assert.rejects(fetchKhlProtocol("1436", "901980", new AbortController().signal), /HTTP_403/);
    await assert.rejects(fetchKhlProtocol("../", "901980", new AbortController().signal), /SCOPE_INVALID/);
  } finally { globalThis.fetch = original; }
});
