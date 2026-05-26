import assert from "node:assert/strict";
import test from "node:test";

import { hasDatabaseUrl } from "./database-url";

test("database URL detection ignores empty env values", () => {
  assert.equal(hasDatabaseUrl(undefined), false);
  assert.equal(hasDatabaseUrl(null), false);
  assert.equal(hasDatabaseUrl(""), false);
  assert.equal(hasDatabaseUrl("   "), false);
  assert.equal(hasDatabaseUrl("postgresql://fantasy_app:fantasy_app_password@localhost:5433/fantasy_scout"), true);
});
