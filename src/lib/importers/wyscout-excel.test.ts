import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { parseWyscoutWorkbook } from "@/lib/importers/wyscout-excel";
import { parseWyscoutTeamStatsWorkbook } from "@/lib/importers/wyscout-team-stats-excel";

test("Wyscout player importer reads generated xlsx rows and market values", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Players");
  sheet.addRow(["Report"]);
  sheet.addRow([
    "Player",
    "Team",
    "Position",
    "Age",
    "Market value",
    "Contract expires",
    "Matches played",
    "Minutes played",
    "Goals",
    "xG",
    "Assists",
    "xA"
  ]);
  sheet.addRow([
    "John Striker",
    "Baltika",
    "CF",
    24,
    `${String.fromCharCode(0x20ac)}1.5m`,
    new Date(Date.UTC(2027, 5, 30)),
    10,
    850,
    4,
    3.2,
    2,
    1.7
  ]);

  const result = await parseWyscoutWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()), { name: "Baltika" });

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].playerName, "John Striker");
  assert.equal(result.rows[0].positionGroup, "FWD");
  assert.equal(result.rows[0].marketValue, 1_500_000);
  assert.equal(result.rows[0].contractExpires?.toISOString(), "2027-06-30T00:00:00.000Z");
});

test("Wyscout team stats importer reads generated xlsx match pairs", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Team Stats");
  sheet.addRow(["Date", "Competition", "Duration", "Match", "Team", "Goals", "xG"]);
  sheet.addRow([new Date(Date.UTC(2026, 4, 1)), "League", 90, "Baltika - Zenit 2:1", "Baltika", 2, 1.8]);
  sheet.addRow([new Date(Date.UTC(2026, 4, 1)), "League", 90, "Baltika - Zenit 2:1", "Zenit", 1, 0.9]);

  const result = await parseWyscoutTeamStatsWorkbook(
    Buffer.from(await workbook.xlsx.writeBuffer()),
    { id: "baltika-id", name: "Baltika", aliases: [] },
    [
      { id: "baltika-id", name: "Baltika", aliases: [] },
      { id: "zenit-id", name: "Zenit", aliases: [] }
    ]
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.fixtures.length, 1);
  assert.equal(result.fixtures[0].homeTeamId, "baltika-id");
  assert.equal(result.fixtures[0].awayTeamId, "zenit-id");
  assert.equal(result.fixtures[0].homeScore, 2);
  assert.equal(result.fixtures[0].awayXg, 0.9);
});
