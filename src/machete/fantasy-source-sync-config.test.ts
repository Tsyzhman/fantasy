import assert from "node:assert/strict";
import test from "node:test";

import {
  fantasySourceScopeKey,
  parseFoontasyScopeDefinitions,
  selectRequestedScopes
} from "./fantasy-source-sync-config";

test("Foontasy admin scopes accept only numeric league IDs and safe assistant slugs", () => {
  assert.deepEqual(
    parseFoontasyScopeDefinitions("63:rpl;57:eredivisie").map((scope) => [scope.leagueId, scope.sourceKey]),
    [[63n, "rpl"], [57n, "eredivisie"]]
  );
  assert.throws(() => parseFoontasyScopeDefinitions("63:https://evil.example"), /Invalid Foontasy sync scope/);
  assert.throws(() => parseFoontasyScopeDefinitions("63:rpl;63:rpl"), /Duplicate Foontasy sync scope/);
});

test("admin requests cannot inject an unconfigured league scope", () => {
  const available = [
    { leagueId: 87n, season: "2026/2027", sourceKey: "spain" },
    { leagueId: 48n, season: "2026/2027", sourceKey: "championship" }
  ];
  const keyFor = (scope: typeof available[number]) => fantasySourceScopeKey(scope, scope.sourceKey);
  assert.deepEqual(selectRequestedScopes(available, [keyFor(available[1])], keyFor), [available[1]]);
  assert.throws(() => selectRequestedScopes(available, ["71:2026/2027:turkey"], keyFor), /Unsupported league scope/);
});
