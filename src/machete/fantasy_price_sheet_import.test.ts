import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { parseFantasyPriceWorkbook } from "./fantasy_price_sheet_import";

test("fantasy price workbook normalizes Sports.ru position labels", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Prices");
  sheet.addRow(["\u0418\u043c\u044f", "\u041a\u043b\u0443\u0431", "\u041f\u043e\u0437\u0438\u0446\u0438\u044f", "\u0426\u0435\u043d\u0430"]);
  sheet.addRow(["Keeper", "Club", "\u0412\u0420", 5]);
  sheet.addRow(["Defender", "Club", "\u0417\u0410\u0429", 5]);
  sheet.addRow(["Midfielder", "Club", "\u041f\u0417", 5]);
  sheet.addRow(["Forward", "Club", "\u041d\u0410\u041f", 5]);

  const parsed = parseFantasyPriceWorkbook(workbook, { sheetName: "Prices" });

  assert.deepEqual(parsed.rows.map((row) => row.position), ["GK", "DEF", "MID", "FWD"]);
});

test("fantasy price workbook keeps FotMob player-name hints from the first column", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Prices");
  sheet.addRow(["fotmob", "fc", "\u0418\u043c\u044f", "\u041a\u043b\u0443\u0431", "\u041f\u043e\u0437\u0438\u0446\u0438\u044f", "\u0426\u0435\u043d\u0430", "", "", "", "\u0441\u043f\u043e\u0440\u0442\u0441", "fotmob"]);
  sheet.addRow(["David Raya", "Arsenal", "\u0420\u0430\u0439\u044f", "\u0410\u0440\u0441\u0435\u043d\u0430\u043b", "\u0432\u0440", 6, "", "", "", "\u0410\u0440\u0441\u0435\u043d\u0430\u043b", "Arsenal"]);

  const parsed = parseFantasyPriceWorkbook(workbook, { sheetName: "Prices" });

  assert.equal(parsed.rows[0].playerName, "\u0420\u0430\u0439\u044f");
  assert.equal(parsed.rows[0].fotmobPlayerName, "David Raya");
  assert.equal(parsed.rows[0].teamName, "Arsenal");
  assert.equal(parsed.rows[0].raw.fotmobPlayerName, "David Raya");
});
