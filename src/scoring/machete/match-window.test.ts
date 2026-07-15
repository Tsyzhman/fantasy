import assert from "node:assert/strict";
import test from "node:test";

import { matchWindowModeValue, parseMacheteMatchWindow } from "./match-window";

test("parses and serializes last 3 team match window", () => {
  const window = parseMacheteMatchWindow({ mode: "last3" });

  assert.deepEqual(window, { kind: "last", matches: 3 });
  assert.equal(matchWindowModeValue(window), "last3");
});
