import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const squadPage = fs.readFileSync(path.join(process.cwd(), "src/app/machete/squad/page.tsx"), "utf8");
const panel = fs.readFileSync(path.join(process.cwd(), "src/components/machete/FranchiseSquadsPanel.tsx"), "utf8");
const preview = fs.readFileSync(path.join(process.cwd(), "src/components/machete/FranchiseSquadPreview.tsx"), "utf8");
const api = fs.readFileSync(path.join(process.cwd(), "src/app/api/machete/franchise-squads/route.ts"), "utf8");
const legacyPage = fs.readFileSync(path.join(process.cwd(), "src/app/machete/franchise-squads/page.tsx"), "utf8");
const legacyAdminPage = fs.readFileSync(path.join(process.cwd(), "src/app/admin/franchise-squads/page.tsx"), "utf8");

test("franchise squads are lazy-loaded inside the selected squad league", () => {
  assert.match(squadPage, /<FranchiseSquadsPanel/);
  assert.match(squadPage, /leagueId=\{String\(selectedLeague\.leagueId\)\}/);
  assert.match(panel, /<details id="franchise-squads"/);
  assert.match(panel, /\/api\/machete\/franchise-squads/);
  assert.match(panel, /row\.starterCount/);
  assert.doesNotMatch(panel, /selectedCount/);
  assert.match(panel, /Advanced filters/);
  assert.match(panel, /filterFranchiseSquadRows/);
  assert.match(panel, /aria-expanded=\{expanded\}/);
  assert.match(panel, /aria-controls=\{previewId\}/);
  assert.match(panel, /<FranchiseSquadPreview players=\{row\.previewPlayers\}/);
  assert.match(panel, /onClientSortChange=\{\(\) => setExpandedUserIds\(new Set\(\)\)\}/);
  assert.match(api, /previewPlayers: row\.previewPlayers/);
});

test("franchise API enforces viewer access and hides private user fields", () => {
  assert.match(api, /requireApiUser\(request\)/);
  assert.match(api, /resolveVisibleFranchise\(auth\.user/);
  assert.match(api, /adminCanSwitch \? \{ email: row\.email, isActive: row\.isActive \} : \{\}/);
  assert.match(api, /row\.userName === row\.email \? "Пользователь"/);
});

test("the integrated table identifies players with zero or missing Alt", () => {
  assert.match(panel, /alternativeIssuePlayerNames\.join/);
  assert.match(panel, /Альт 0\/нет прогноза/);
});

test("expanded franchise squad is a read-only starting XI and bench preview", () => {
  assert.match(preview, /Squad preview/);
  assert.match(preview, /Предпросмотр состава/);
  assert.match(preview, /Starting XI/);
  assert.match(preview, /Стартовый состав/);
  assert.match(preview, /Bench/);
  assert.match(preview, /Запас/);
  assert.match(preview, /Read only/);
  assert.match(preview, /Только просмотр/);
  assert.match(preview, /data-read-only-player-card="true"/);
  assert.doesNotMatch(preview, /onRemove|onToggleCaptain|onToggleVice|onDrop|draggable|Замена/);
});

test("old franchise URLs redirect into the integrated squad page", () => {
  assert.match(legacyPage, /redirect\(`\/machete\/squad/);
  assert.match(legacyAdminPage, /redirect\("\/machete\/squad#franchise-squads"\)/);
});
