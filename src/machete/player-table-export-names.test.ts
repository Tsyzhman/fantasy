import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { tableExportResponse } from "@/lib/table-export";
import { fotMobExportColumns, loadFotMobExportNames, resolvePoolExportNames, resolveStoredPlayerExportNames } from "./player-table-export-names";

type Row = Record<string, string | number | null>;

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("Excel writes verified FotMob names first, preserves provider names, prices and duplicate input rows", async () => {
  const queries: unknown[] = [];
  const players = [
    { id: 1201406n, name: "Pablo Solari", source: "fotmob", fantasyPrices: [{ playerName: "Пабло Солари" }] },
    { id: 13n, name: "FotMob player 13", source: "fotmob", fantasyPrices: [] },
    { id: 17n, name: "Wendel", source: "fotmob", fantasyPrices: [] },
    { id: 18n, name: "Имя Спортса", source: "sports_ru", fantasyPrices: [{ playerName: "Имя Спортса" }] }
  ];
  const prisma = { corePlayer: { findMany: async ({ where }: { where: unknown }) => { queries.push(where); return players; } } } as unknown as PrismaClient;
  const labels = ["FotMob player 1201406", "FotMob player 13", "Wendel", "FotMob player 1201406", "FotMob player 9999999999999999999", "Имя Спортса"];
  const rows: Row[] = labels.map(player => ({ player, price: 7.5 }));
  const names = await resolveStoredPlayerExportNames(prisma, rows);
  assert.equal(queries.length, 1);
  assert.deepEqual((queries[0] as { OR: unknown[] }).OR[0], {id: { in: [1201406n, 13n] }});
  const response = await tableExportResponse({
    rows, columns: [...fotMobExportColumns<Row>(row => names.get(row), "ru"),
      { header: "Игрок", value: row => row.player }, { header: "Цена", value: row => row.price }],
    filename: "players", format: "xlsx", additionalSheets: [{
      sheetName: "Clubs", rows: [{name: "П. Солари"}], columns: [{header: "Клуб", value: row => row.name}]
    }]
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const [sheet, clubs] = workbook.worksheets;
  assert.deepEqual(sheet.getRow(1).values, [, "Сокращённое имя FotMob", "Полное имя FotMob", "Игрок", "Цена"]);
  assert.deepEqual(rows.map((_, i) => [1, 2, 3, 4].map(n => sheet.getCell(i + 2, n).value)), [
    ["P. Solari", "Pablo Solari", "Пабло Солари", 7.5], [null, null, null, 7.5], ["Wendel", "Wendel", "Wendel", 7.5],
    ["P. Solari", "Pablo Solari", "Пабло Солари", 7.5], [null, null, null, 7.5], [null, null, "Имя Спортса", 7.5]
  ]);
  assert.equal(sheet.rowCount, rows.length + 1);
  assert.equal(clubs.name, "Clubs");
  assert.equal(clubs.getCell("A2").value, "П. Солари");
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("stable core IDs only load verified FotMob names in one deduplicated batch", async () => {
  const queries: unknown[] = [];
  const prisma = {corePlayer: {findMany: async ({where}: {where: unknown}) => {
    queries.push(where);
    return [{id: 11n, name: "Virgil van Dijk"}, {id: 12n, name: "FotMob player 12"}];
  }}} as unknown as PrismaClient;
  const rows: Row[] = [{playerId: "11", player: "Вирджил ван Дейк"}, {playerId: "12", player: "Игрок"}, {playerId: "11", player: "Ван Дейк"}];
  const names = await resolveStoredPlayerExportNames(prisma, rows);
  const columns = fotMobExportColumns<Row>(r => names.get(r), "en");
  assert.deepEqual(columns.map(c => c.header), ["FotMob short name", "FotMob full name"]);
  assert.deepEqual(rows.map(r => columns.map(c => c.value(r))), [["V. van Dijk", "Virgil van Dijk"], [null, null], ["V. van Dijk", "Virgil van Dijk"]]);
  assert.deepEqual(queries, [{source: "fotmob", id: {in: [11n, 12n]}}]);
  assert.equal((await loadFotMobExportNames(prisma, ["", "0", "1.2", "9999999999999999999"])).size, 0);
  assert.equal(queries.length, 1);
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("legacy table namesakes need a unique match, with the club when available", async () => {
  const sameName = "А. Иванов";
  const players = ["Alex Ivanov", "Artem Ivanov"].map((name, index) => ({
    id: BigInt(index + 1), name, source: "fotmob", fantasyPrices: [{ playerName: sameName, teamName: ["Клуб 1", "Клуб 2"][index] }]
  }));
  const prisma = {corePlayer: {findMany: async () => players}} as unknown as PrismaClient;
  const rows: Row[] = [{player: sameName}, {player: sameName, team: "Клуб 2"}, {player: "Alex Ivanov"}];
  const names = await resolveStoredPlayerExportNames(prisma, rows);
  assert.deepEqual(rows.map(row => names.get(row)), [null, "Artem Ivanov", "Alex Ivanov"]);
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("an orphaned provider record cannot shadow a relinked price from an older tab", async () => {
  const label = "Ксавье Мандза";
  const orphanId = "8000000000072620";
  const prisma = { corePlayer: { findMany: async () => [
    { id: BigInt(orphanId), source: "sports_ru", name: label, fantasyPrices: [] },
    { id: 2116938n, source: "fotmob", name: "Xavier Mandza", fantasyPrices: [{ playerName: label, teamName: "Ницца" }] }
  ] } } as unknown as PrismaClient;
  const rows: Row[] = [{ player: label }, { player: label, playerId: orphanId }];
  const names = await resolveStoredPlayerExportNames(prisma, rows);
  assert.deepEqual(rows.map(row => names.get(row)), ["Xavier Mandza", null]);
  assert.deepEqual(rows.map(row => row.player), [label, label]);
});

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
test("pool uses scoped provider IDs and exact unambiguous aliases and never exports a Latin matching hint", async () => {
  const scope = { provider: "SPORTS_RU", leagueId: 53n, season: "2026/2027" };
  const names = ["Ксавье Мандза", "Другой игрок", "Тёзка", "Имя Спортса"];
  const prices = names.map((playerName, i) => ({
    providerPlayerId: String(72620 + i), playerId: BigInt(2116938 + i), playerName,
    teamName: i === 1 ? "Лион" : "Ницца", team: { name: i === 1 ? "Lyon" : "Nice" },
    player: { id: BigInt(2116938 + i), source: i === 3 ? "sports_ru" : "fotmob", name: ["Xavier Mandza", "Xavier Mandza", "Another player", playerName][i] },
    fotmobPlayerName: "Ambiguous alias"
  }));
  const queries: unknown[] = [];
  const prisma = {fantasyPlayerPrice: {findMany: async ({where}: {where: unknown}) => {
    queries.push(where); return prices;
  }}} as unknown as PrismaClient;
  const rows: Row[] = [
    {team: "Nice", player: "previous value", providerPlayerId: "72620"},
    {team: "Nice", player: "Xavier Mandza"}, {team: "Лион", player: "Xavier Mandza"},
    {team: "Nice", player: "FotMob player 2116938"}, {team: "Nantes", player: "Xavier Mandza"},
    {team: "Nice", player: "Ambiguous alias"}, {team: "Nice", player: "Other", playerId: "2116941"}
  ];
  const fotMob = await resolvePoolExportNames(prisma, rows, scope);
  assert.deepEqual(rows.map(r => r.player), [names[0], names[0], names[1], names[0], "Xavier Mandza", "Ambiguous alias", names[3]]);
  assert.deepEqual(rows.map(r => fotMob.get(r) ?? null), ["Xavier Mandza", "Xavier Mandza", "Xavier Mandza", "Xavier Mandza", null, null, null]);
  await resolvePoolExportNames(prisma, [rows[0], rows[0], rows[6]], {...scope, provider: "FPL"});
  assert.deepEqual(queries, [scope, {...scope, provider: "FPL", OR: [{providerPlayerId: {in: ["72620"]}}, {playerId: {in: [2116941n]}}]}]);
});
