import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("safe brace expansion remains callable for legacy minimatch consumers", () => {
  const expand = require("brace-expansion") as {
    (pattern: string): string[];
    expand: (pattern: string) => string[];
    EXPANSION_MAX_LENGTH: number;
  };

  assert.equal(typeof expand, "function");
  assert.equal(expand.expand, expand);
  assert.deepEqual(expand("player-{fo,alt}"), ["player-fo", "player-alt"]);
  assert.ok(expand.EXPANSION_MAX_LENGTH > 0);
});
