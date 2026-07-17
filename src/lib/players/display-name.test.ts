import assert from "node:assert/strict";
import test from "node:test";

import { compactPlayerDisplayName } from "./display-name";

test("player display names use first initial and surname", () => {
  assert.equal(compactPlayerDisplayName("Bryan Mbeumo"), "B. Mbeumo");
  assert.equal(compactPlayerDisplayName("Алексей Миранчук"), "А. Миранчук");
  assert.equal(compactPlayerDisplayName("Neymar"), "Neymar");
});

test("player display names preserve multi-word surname particles", () => {
  assert.equal(compactPlayerDisplayName("Kevin De Bruyne"), "K. De Bruyne");
  assert.equal(compactPlayerDisplayName("Virgil van Dijk"), "V. van Dijk");
});

test("player display names normalize surrounding whitespace without mutating the full source name", () => {
  const fullName = "  Trent   Alexander-Arnold  ";
  assert.equal(compactPlayerDisplayName(fullName), "T. Alexander-Arnold");
  assert.equal(fullName, "  Trent   Alexander-Arnold  ");
});
