import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";

import { parseTableExportFormat, tableExportResponse } from "@/lib/table-export";
import { toExcelCsv } from "@/lib/csv";

test("parseTableExportFormat accepts csv and xlsx only", () => {
  assert.equal(parseTableExportFormat("csv"), "csv");
  assert.equal(parseTableExportFormat("xlsx"), "xlsx");
  assert.equal(parseTableExportFormat("json"), null);
  assert.equal(parseTableExportFormat(null), "csv");
});

test("Russian Excel CSV uses a UTF-8 BOM and semicolon columns", () => {
  const csv = toExcelCsv([{ name: "Вендел", team: "Зенит" }], [
    { header: "Игрок", value: (row) => row.name },
    { header: "Команда", value: (row) => row.team }
  ]);

  assert.equal(csv, "\uFEFFИгрок;Команда\r\nВендел;Зенит\r\n");
});

test("tableExportResponse emits csv files", async () => {
  const response = await tableExportResponse({
    rows: [{ name: "Player", score: 12 }],
    columns: [
      { header: "Name", value: (row) => row.name },
      { header: "Score", value: (row) => row.score }
    ],
    format: "csv",
    filename: "players",
    sheetName: "Players"
  });

  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(await response.text(), "Name,Score\r\nPlayer,12\r\n");
});

test("tableExportResponse emits xlsx files", async () => {
  const response = await tableExportResponse({
    rows: [{ name: "Player", score: 12.5, fixture: "1-2" }],
    columns: [
      { header: "Name", value: (row) => row.name },
      { header: "Score", value: (row) => row.score },
      { header: "Fixture", value: (row) => row.fixture }
    ],
    format: "xlsx",
    filename: "players",
    sheetName: "Players"
  });
  const body = Buffer.from(await response.arrayBuffer());

  assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(body.subarray(0, 2).toString("utf8"), "PK");
  assert.ok(body.length > 100);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(body as unknown as ArrayBuffer);
  const worksheet = workbook.getWorksheet("Players");
  assert.equal(worksheet?.getCell("B2").value, 12.5);
  assert.equal(typeof worksheet?.getCell("B2").value, "number");
  assert.equal(worksheet?.getCell("C2").value, "1-2");
  assert.equal(typeof worksheet?.getCell("C2").value, "string");
});
