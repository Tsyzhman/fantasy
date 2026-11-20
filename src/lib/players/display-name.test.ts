import assert from "node:assert/strict";
import test from "node:test";

import { compactPlayerDisplayName, playerPoolExportName } from "./display-name";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("Excel pool and starting XI use the fantasy provider's display name and skip stale ID-only labels", () => {
  const player = { name: "Пабло Солари", fotmobName: "Pablo Solari" };
  assert.equal(playerPoolExportName(player), "Пабло Солари");
  assert.equal(playerPoolExportName({ name: "Си-Джей Иган-Райли", fotmobName: "CJ Egan-Riley" }), "Си-Джей Иган-Райли");
  assert.equal(playerPoolExportName({ name: "Ксавье Мандза", fotmobName: "Xavier Mandza" }), "Ксавье Мандза");
  assert.equal(playerPoolExportName({ name: "M.Salah", fotmobName: "Mohamed Salah" }), "M.Salah");
  assert.equal(playerPoolExportName({ ...player, fotmobName: " FotMob player 1201406 " }), "Пабло Солари");
  assert.equal(playerPoolExportName({ ...player, name: "FotMob player 1201406" }), "Pablo Solari");
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
  assert.equal(compactPlayerDisplayName("Вирджил ван Дейк"), "В. ван Дейк");
  assert.equal(compactPlayerDisplayName("Микки ван де Вен"), "М. ван де Вен");
});

test("player display names normalize surrounding whitespace without mutating the full source name", () => {
  const fullName = "  Trent   Alexander-Arnold  ";
  assert.equal(compactPlayerDisplayName(fullName), "T. Alexander-Arnold");
  assert.equal(fullName, "  Trent   Alexander-Arnold  ");
});
