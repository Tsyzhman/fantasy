import assert from "node:assert/strict";
import test from "node:test";

import { compactPlayerDisplayName, playerPoolExportName } from "./display-name";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("Excel pool and starting XI names preserve provider preferences and skip stale ID-only labels", () => {
  const player = { name: "Пабло Солари", fotmobName: "Pablo Solari" };
  assert.equal(playerPoolExportName(player), "Pablo Solari");
  assert.equal(playerPoolExportName(player, "FPL"), "Пабло Солари");
  assert.equal(playerPoolExportName({ ...player, fotmobName: " FotMob player 1201406 " }), "Пабло Солари");
  assert.equal(playerPoolExportName({ ...player, name: "FotMob player 1201406" }, "FPL"), "Pablo Solari");
  assert.equal(playerPoolExportName({ name: "FotMob player 1201406" }), "");
});

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
