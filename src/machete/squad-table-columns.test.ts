import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { defaultSquadTableColumns, isSquadTableColumnsInput, isSquadTableColumnWidthsInput, isSquadTableFilterKey, moveSquadTableColumn, parseSquadTableColumns, parseSquadTableColumnWidths, squadTableValueFilterIsActive, squadTableValueMatchesFilter } from "./squad-table-columns";

test("squad table columns default excludes the invented Foontasy horizon", () => {
  assert.deepEqual(parseSquadTableColumns(null), [...defaultSquadTableColumns]);
  assert.ok(defaultSquadTableColumns.includes("foontasy"));
  assert.ok(defaultSquadTableColumns.includes("nextFpPerPrice"));
  assert.ok(defaultSquadTableColumns.includes("foontasyPerPrice"));
  assert.ok(defaultSquadTableColumns.includes("alternativePerPrice"));
  assert.ok(defaultSquadTableColumns.includes("modelHorizon"));
  assert.ok(!defaultSquadTableColumns.some((key) => key.toLowerCase().includes("foontasyhorizon")));
});

test("squad table columns accept known and dynamic player stats but reject arbitrary keys", () => {
  assert.deepEqual(parseSquadTableColumns(["nextFp", "stat:xg_per_90_l5", "bad", "nextFp"]), ["nextFp", "stat:xg_per_90_l5"]);
  assert.equal(isSquadTableColumnsInput(["nextFp", "stat:shots_on_target"]), true);
  assert.equal(isSquadTableColumnsInput(["bad"]), false);
});

test("visible squad table columns can be reordered without mutating the saved preference", () => {
  const original = ["nextFp", "foontasy", "alternative"];
  assert.deepEqual(moveSquadTableColumn(original, "foontasy", -1), ["foontasy", "nextFp", "alternative"]);
  assert.deepEqual(moveSquadTableColumn(original, "foontasy", 1), ["nextFp", "alternative", "foontasy"]);
  assert.deepEqual(moveSquadTableColumn(original, "nextFp", -1), original);
  assert.deepEqual(original, ["nextFp", "foontasy", "alternative"]);
});

test("legacy 3R and 5R model columns migrate to one stable horizon column", () => {
  assert.deepEqual(parseSquadTableColumns(["nextFp", "modelT5", "alternative", "modelT3"]), ["nextFp", "modelHorizon", "alternative"]);
  assert.deepEqual(parseSquadTableColumnWidths({ modelT5: 118 }), { modelHorizon: 118 });
});

test("per-user column widths accept fixed, optional, and dynamic columns within safe bounds", () => {
  assert.deepEqual(parseSquadTableColumnWidths({ player: 210.4, foontasy: 20, "stat:xg_per_90_l5": 900, bad: 100 }), {
    player: 210,
    foontasy: 40,
    "stat:xg_per_90_l5": 640
  });
  assert.equal(isSquadTableColumnWidthsInput({ player: 220, action: 40, alternative: 120 }), true);
  assert.equal(isSquadTableColumnWidthsInput({ bad: 120 }), false);
});

test("user column persistence has a dedicated migration and authenticated route", () => {
  const migration = readFileSync(new URL("../../prisma/migrations/000020_user_squad_table_columns/migration.sql", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/user/squad-table-columns/route.ts", import.meta.url), "utf8");
  assert.match(migration, /ADD COLUMN "squad_table_columns" JSONB/);
  const widthMigration = readFileSync(new URL("../../prisma/migrations/000021_user_squad_table_column_widths/migration.sql", import.meta.url), "utf8");
  assert.match(widthMigration, /ADD COLUMN "squad_table_column_widths" JSONB/);
  assert.match(route, /requireApiUser/);
  assert.match(route, /where: \{ id: auth\.user\.id \}/);
});

test("advanced column filters support numeric ranges and case-insensitive text", () => {
  assert.equal(isSquadTableFilterKey("player"), true);
  assert.equal(isSquadTableFilterKey("stat:xg_per_90_l5"), true);
  assert.equal(isSquadTableFilterKey("unsafe"), false);
  assert.equal(squadTableValueMatchesFilter(7.5, { minimum: "7", maximum: "8", query: "" }, true), true);
  assert.equal(squadTableValueMatchesFilter(8.5, { minimum: "7", maximum: "8", query: "" }, true), false);
  assert.equal(squadTableValueMatchesFilter(null, { minimum: "1", maximum: "", query: "" }, true), false);
  assert.equal(squadTableValueMatchesFilter("Балтика", { minimum: "", maximum: "", query: "бал" }, false), true);
  assert.equal(squadTableValueFilterIsActive({ minimum: "", maximum: "", query: "" }, false), false);
  assert.equal(squadTableValueFilterIsActive({ minimum: "0", maximum: "", query: "" }, true), true);
});
