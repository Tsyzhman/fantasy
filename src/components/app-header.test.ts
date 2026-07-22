import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./app-header.tsx", import.meta.url), "utf8");

test("global header contains only the requested product navigation", () => {
  for (const label of ["Лиги", "Состав", "Игроки", "Миксер", "Модель", "Админ", "Профиль", "Выйти"]) {
    assert.match(source, new RegExp(`ru=\"${label}\"`));
  }
  const navigation = source.slice(source.indexOf("function HeaderNavigationItems"), source.indexOf("function HeaderLink"));
  const navigationItems = ['href="/machete/leagues"', 'href="/machete/squad"', 'href="/machete/players"', 'href="/mixerr"', 'href="/machete/models"', 'href="/admin/ingestion"', 'href="/profile"'];
  let previousIndex = -1;
  for (const item of navigationItems) {
    const index = navigation.indexOf(item);
    assert.ok(index > previousIndex, `${item} must exist in the requested order`);
    previousIndex = index;
  }
  assert.match(source, /user\?\.role === "ADMIN"/);
  assert.match(source, /<LanguageToggle \/>[\s\S]*<ThemeToggle \/>/);
});

test("squad navigation opens the integrated squad page directly", () => {
  assert.doesNotMatch(source, /function SquadHeaderMenu/);
  assert.match(source, /href="\/machete\/squad"/);
  assert.doesNotMatch(source, /href="\/machete\/franchise-squads"/);
});
