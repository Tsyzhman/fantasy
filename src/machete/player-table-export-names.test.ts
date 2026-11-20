import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { tableExportResponse } from "@/lib/table-export";
import { resolveStoredPlayerExportNames } from "./player-table-export-names";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("XLSX from an older open tab resolves repeated IDs once and retains every row and numeric price", async () => {
  const calls: bigint[][] = [];
  const prisma = {
    corePlayer: {
      async findMany({ where }: { where: { id: { in: bigint[] } } }) {
        calls.push(where.id.in);
        return [{ id: 1201406n, name: "Pablo Solari" }, { id: 13n, name: "FotMob player 13" }];
      }
    }
  } as unknown as PrismaClient;
  const names = ["FotMob player 1201406", "FotMob player 13", "Wendel", "FotMob player 1201406", "FotMob player 9999999999999999999"];
  const rows = names.map((player) => ({ player, price: 7 }));
  await resolveStoredPlayerExportNames(prisma, rows);
  await resolveStoredPlayerExportNames(prisma, rows);
  assert.deepEqual(calls, [[1201406n, 13n]]);
  const response = await tableExportResponse({
    rows, columns: [{ header: "Player", value: row => row.player }, { header: "Price", value: row => row.price }],
    filename: "players", format: "xlsx"
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, 6);
  assert.deepEqual(names.map((_, i) => sheet.getCell(i + 2, 1).value), ["Pablo Solari", null, "Wendel", "Pablo Solari", null]);
  assert.deepEqual(names.map((_, i) => sheet.getCell(i + 2, 2).value), [7, 7, 7, 7, 7]);
});
