import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTableExportFormat, tableExportResponse } from "@/lib/table-export";

test("parseTableExportFormat accepts csv and xlsx only", () => {
  assert.equal(parseTableExportFormat("csv"), "csv");
  assert.equal(parseTableExportFormat("xlsx"), "xlsx");
  assert.equal(parseTableExportFormat("json"), null);
  assert.equal(parseTableExportFormat(null), "csv");
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
    rows: [{ name: "Player", score: 12 }],
    columns: [
      { header: "Name", value: (row) => row.name },
      { header: "Score", value: (row) => row.score }
    ],
    format: "xlsx",
    filename: "players",
    sheetName: "Players"
  });
  const body = Buffer.from(await response.arrayBuffer());

  assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(body.subarray(0, 2).toString("utf8"), "PK");
  assert.ok(body.length > 100);
});
