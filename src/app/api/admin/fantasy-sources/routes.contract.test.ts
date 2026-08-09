import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prices = readFileSync(new URL("./prices/start/route.ts", import.meta.url), "utf8");
const foontasy = readFileSync(new URL("./foontasy/start/route.ts", import.meta.url), "utf8");

test("fantasy source update routes are admin-only and validate against server-side scope allowlists", () => {
  for (const source of [prices, foontasy]) {
    assert.match(source, /requireApiAdmin\(\)/);
    assert.match(source, /selectRequestedScopes\(available, keys/);
    assert.match(source, /Array\.isArray\(body\?\.scopes\)/);
  }
});

test("price updates use the mapping-preserving manual scheduler entry point", () => {
  assert.match(prices, /runSportsRuFantasySyncNow\("manual", selected\)/);
});

test("Foontasy updates use configured credentials without accepting a URL from the browser", () => {
  assert.match(foontasy, /foontasySyncConfigFromEnv\(\)/);
  assert.match(foontasy, /url: scope\.url/);
  assert.doesNotMatch(foontasy, /body\.(?:url|leagueId|season)/);
});
