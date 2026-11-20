import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { tableExportResponse } from "@/lib/table-export";
import { resolvePoolExportNames, resolveStoredPlayerExportNames } from "./player-table-export-names";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("XLSX from an older open tab resolves repeated IDs once and retains every row and numeric price", async () => {
  const calls: bigint[][] = [];
  const prisma = {
    corePlayer: {
      async findMany({ where }: { where: { id: { in: bigint[] } } }) {
        calls.push(where.id.in);
        return [
          { id: 1201406n, name: "Pablo Solari", fantasyPrices: [{ playerName: "Пабло Солари" }] },
          { id: 13n, name: "FotMob player 13", fantasyPrices: [] }
        ];
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
  assert.deepEqual(names.map((_, i) => sheet.getCell(i + 2, 1).value), ["Пабло Солари", null, "Wendel", "Пабло Солари", null]);
  assert.deepEqual(names.map((_, i) => sheet.getCell(i + 2, 2).value), [7, 7, 7, 7, 7]);
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("pool exports resolve current IDs and unambiguous legacy club aliases within the selected provider, league and season", async () => {
  const scope = { provider: "SPORTS_RU", leagueId: 53n, season: "2026/2027" };
  const names = ["Ксавье Мандза", "Другой игрок", "Тёзка"];
  const prices = names.map((playerName, i) => ({
    providerPlayerId: String(72620 + i), playerId: BigInt(2116938 + i), playerName,
    teamName: i === 1 ? "Лион" : "Ницца", team: { name: i === 1 ? "Lyon" : "Nice" },
    player: { name: i === 2 ? "Another player" : "Xavier Mandza" }, fotmobPlayerName: "Ambiguous alias"
  }));
  const queries: unknown[] = [];
  const prisma = { fantasyPlayerPrice: { findMany: async ({ where }: { where: unknown }) => {
    queries.push(where);
    return prices;
  } } } as unknown as PrismaClient;
  const rows: Array<Record<string, string>> = [
    { team: "Nice", player: "previous value", providerPlayerId: "72620" },
    { team: "Nice", player: "Xavier Mandza" }, { team: "Лион", player: "Xavier Mandza" },
    { team: "Nice", player: "FotMob player 2116938" }, { team: "Nantes", player: "Xavier Mandza" },
    { team: "Nice", player: "Ambiguous alias" }
  ];
  await resolvePoolExportNames(prisma, rows, scope);
  assert.deepEqual(rows.map(row => row.player), [names[0], names[0], names[1], names[0], "Xavier Mandza", "Ambiguous alias"]);
  await resolvePoolExportNames(prisma, [rows[0], rows[0]], { ...scope, provider: "FPL" });
  assert.deepEqual(queries, [scope, { ...scope, provider: "FPL", providerPlayerId: { in: ["72620"] } }]);
});
