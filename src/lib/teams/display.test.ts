import assert from "node:assert/strict";
import test from "node:test";

import { compactTeamDisplayName, providerTeamShortName } from "./display";

test("compact team display prefers the explicit provider short name", () => {
  assert.equal(
    compactTeamDisplayName({
      name: "Manchester United",
      shortName: " Man\nUnited ",
      metadata: { short_name: "MU" }
    }),
    "Man United"
  );
});

test("compact team display reads normalized FotMob season metadata", () => {
  assert.equal(compactTeamDisplayName({ name: "Nottingham Forest", metadata: { short_name: "Nottm Forest" } }), "Nottm Forest");
  assert.equal(providerTeamShortName({ metadata: { shortName: "Legacy short" } }), "Legacy short");
});

test("compact team display falls back to the canonical full name for unsafe or empty short data", () => {
  assert.equal(compactTeamDisplayName({ name: " Brighton & Hove Albion ", shortName: "\u0000\n" }), "Brighton & Hove Albion");
  assert.equal(compactTeamDisplayName({ name: "Chelsea", metadata: ["CHE"] }), "Chelsea");
  assert.equal(compactTeamDisplayName({ name: null, shortName: 123 }), null);
});
