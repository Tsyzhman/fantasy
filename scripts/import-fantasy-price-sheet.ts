import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";

import { ensureDatabaseSchema, prisma } from "@/lib/db";
import { normalizeSportsRuPlayerName } from "@/lib/providers/sports-ru-fantasy";
import { autoMapSportsRuFantasyPlayers } from "@/machete/sports_ru_player_mapping";

type Args = Record<string, string | boolean>;

type ParsedPriceRow = {
  rowNumber: number;
  playerName: string;
  normalizedName: string;
  sportsTeamName: string;
  teamName: string;
  position: string | null;
  price: number;
  raw: Record<string, unknown>;
};

type PriceSheetColumns = {
  fcCol: number | null;
  nameCol: number;
  clubCol: number;
  positionCol: number;
  priceCol: number;
};

async function main() {
  await ensureDatabaseSchema();
  const args = parseArgs(process.argv.slice(2));
  const file = stringArg(args.file) ?? stringArg(args.path);
  const leagueIdArg = stringArg(args["league-id"]);
  const requestedSeason = stringArg(args.season);
  const provider = stringArg(args.provider) ?? "SPORTS_RU";

  if (!file || !leagueIdArg || !requestedSeason) {
    console.log("Usage:");
    console.log("  npm exec tsx scripts/import-fantasy-price-sheet.ts -- --file ./prices.xlsx --league-id 47 --season 2025/2026 [--sheet \"оценки спортса\"] [--replace]");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const parsed = parseWorkbook(workbook, {
    sheetName: stringArg(args.sheet)
  });

  if (Boolean(args["dry-run"])) {
    console.log(`Parsed ${parsed.rows.length} price rows from "${parsed.sheetName}".`);
    console.table(parsed.rows.slice(0, 12).map((row) => ({
      row: row.rowNumber,
      name: row.playerName,
      team: row.teamName,
      sportsTeam: row.sportsTeamName,
      position: row.position,
      price: row.price
    })));
    return;
  }

  const leagueId = BigInt(leagueIdArg);
  const leagueSeason = await findLeagueSeason(leagueId, requestedSeason);
  if (!leagueSeason) {
    throw new Error(`League season not found: ${leagueId} ${requestedSeason}`);
  }
  const season = leagueSeason.season;

  await prisma.sportsRuFantasyContest.upsert({
    where: {
      provider_leagueId_season: {
        provider,
        leagueId,
        season
      }
    },
    update: {
      name: `${providerLabel(provider)} ${leagueSeason.league.name}`,
      budgetLimit: numberArg(args.budget) ?? 100,
      squadSize: numberArg(args["squad-size"]) ?? 15,
      maxPlayersPerTeam: numberArg(args["max-per-team"]) ?? inferredMaxPlayersPerTeam(leagueSeason.league.name),
      sourceUrl: file,
      rules: {
        source: "xlsx",
        sheetName: parsed.sheetName,
        importedAt: new Date().toISOString()
      },
      lastSyncedAt: new Date()
    },
    create: {
      leagueId,
      season,
      provider,
      name: `${providerLabel(provider)} ${leagueSeason.league.name}`,
      budgetLimit: numberArg(args.budget) ?? 100,
      squadSize: numberArg(args["squad-size"]) ?? 15,
      maxPlayersPerTeam: numberArg(args["max-per-team"]) ?? inferredMaxPlayersPerTeam(leagueSeason.league.name),
      sourceUrl: file,
      rules: {
        source: "xlsx",
        sheetName: parsed.sheetName,
        importedAt: new Date().toISOString()
      },
      lastSyncedAt: new Date()
    }
  });

  const importedIds: string[] = [];
  for (const row of parsed.rows) {
    const price = await prisma.fantasyPlayerPrice.upsert({
      where: {
        provider_leagueId_season_normalizedName_teamName: {
          provider,
          leagueId,
          season,
          normalizedName: row.normalizedName,
          teamName: row.teamName
        }
      },
      update: {
        playerName: row.playerName,
        position: row.position,
        price: row.price,
        raw: row.raw as Prisma.InputJsonValue,
        lastSeenAt: new Date()
      },
      create: {
        leagueId,
        season,
        provider,
        playerName: row.playerName,
        normalizedName: row.normalizedName,
        teamName: row.teamName,
        position: row.position,
        price: row.price,
        raw: row.raw as Prisma.InputJsonValue,
        lastSeenAt: new Date()
      }
    });
    importedIds.push(price.id);
  }

  const deleted = Boolean(args.replace) && importedIds.length > 0 ? await deleteRowsNotInImport(provider, leagueId, season, importedIds) : 0;
  const mapping = await autoMapSportsRuFantasyPlayers(prisma, { leagueId, season });

  console.log(`Imported ${parsed.rows.length} fantasy prices from "${parsed.sheetName}" for ${leagueSeason.league.name} ${season}.`);
  if (deleted > 0) console.log(`Deleted ${deleted} stale price rows for ${provider} ${leagueId} ${season}.`);
  console.log(`Mapped ${mapping.matched} automatically, reused ${mapping.manual} manual links, left ${mapping.unmatched} unmatched.`);
}

async function findLeagueSeason(leagueId: bigint, requestedSeason: string) {
  const exact = await prisma.leagueSeason.findUnique({
    where: {
      leagueId_season: {
        leagueId,
        season: requestedSeason
      }
    },
    include: {
      league: true
    }
  });
  if (exact) return exact;

  const expandedSeason = expandSeasonLabel(requestedSeason);
  if (expandedSeason === requestedSeason) return null;

  return prisma.leagueSeason.findUnique({
    where: {
      leagueId_season: {
        leagueId,
        season: expandedSeason
      }
    },
    include: {
      league: true
    }
  });
}

function parseWorkbook(workbook: ExcelJS.Workbook, input: { sheetName: string | null }) {
  const worksheet = input.sheetName ? workbook.getWorksheet(input.sheetName) : findPriceSheet(workbook);
  if (!worksheet) throw new Error(input.sheetName ? `Sheet was not found: ${input.sheetName}` : "Could not find a price sheet.");

  const header = findPriceHeader(worksheet);
  if (!header) throw new Error(`Could not find price columns in sheet "${worksheet.name}".`);

  const teamAliases = buildTeamAliases(worksheet);
  const rows: ParsedPriceRow[] = [];
  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const playerName = cellString(row.getCell(header.columns.nameCol));
    const sportsTeamName = cellString(row.getCell(header.columns.clubCol));
    const price = cellNumber(row.getCell(header.columns.priceCol));
    if (!playerName || !sportsTeamName || price === null) continue;

    const fcTeamName = header.columns.fcCol ? cellString(row.getCell(header.columns.fcCol)) : null;
    const teamName = fcTeamName || teamAliases.get(sportsTeamName) || sportsTeamName;
    const positionLabel = cellString(row.getCell(header.columns.positionCol));
    const position = normalizePosition(positionLabel);

    rows.push({
      rowNumber,
      playerName,
      normalizedName: normalizeSportsRuPlayerName(playerName),
      sportsTeamName,
      teamName,
      position,
      price,
      raw: {
        source: "xlsx",
        sheetName: worksheet.name,
        rowNumber,
        sportsTeamName,
        teamName,
        positionLabel,
        fcTeamName
      }
    });
  }

  return {
    sheetName: worksheet.name,
    rows
  };
}

function findPriceSheet(workbook: ExcelJS.Workbook) {
  return workbook.worksheets.find((worksheet) => findPriceHeader(worksheet)) ?? null;
}

function findPriceHeader(worksheet: ExcelJS.Worksheet): { rowNumber: number; columns: PriceSheetColumns } | null {
  for (let rowNumber = 1; rowNumber <= Math.min(50, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const headers = new Map<string, number>();
    for (let col = 1; col <= worksheet.columnCount; col += 1) {
      const value = normalizeHeader(cellString(row.getCell(col)));
      if (value) headers.set(value, col);
    }

    const nameCol = firstHeader(headers, ["имя", "игрок", "player", "name"]);
    const clubCol = firstHeader(headers, ["клуб", "команда", "team", "club"]);
    const positionCol = firstHeader(headers, ["позиция", "поз", "position", "pos"]);
    const priceCol = firstHeader(headers, ["цена", "price", "стоимость"]);
    if (nameCol && clubCol && positionCol && priceCol) {
      return {
        rowNumber,
        columns: {
          fcCol: firstHeader(headers, ["fc"]),
          nameCol,
          clubCol,
          positionCol,
          priceCol
        }
      };
    }
  }

  return null;
}

function buildTeamAliases(worksheet: ExcelJS.Worksheet) {
  const aliases = new Map<string, string>();
  for (let rowNumber = 1; rowNumber <= Math.min(50, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let col = 1; col < worksheet.columnCount; col += 1) {
      const left = normalizeHeader(cellString(row.getCell(col)));
      const right = normalizeHeader(cellString(row.getCell(col + 1)));
      if (left !== "спортс" || right !== "fotmob") continue;

      for (let aliasRowNumber = rowNumber + 1; aliasRowNumber <= worksheet.rowCount; aliasRowNumber += 1) {
        const aliasRow = worksheet.getRow(aliasRowNumber);
        const sportsTeamName = cellString(aliasRow.getCell(col));
        const fotmobTeamName = cellString(aliasRow.getCell(col + 1));
        if (!sportsTeamName && !fotmobTeamName) break;
        if (sportsTeamName && fotmobTeamName && !aliases.has(sportsTeamName)) aliases.set(sportsTeamName, fotmobTeamName);
      }

      return aliases;
    }
  }

  return aliases;
}

function deleteRowsNotInImport(provider: string, leagueId: bigint, season: string, importedIds: string[]) {
  return prisma.$transaction(async (tx) => {
    const staleRows = await tx.fantasyPlayerPrice.findMany({
      where: {
        provider,
        leagueId,
        season,
        id: { notIn: importedIds }
      },
      select: {
        id: true
      }
    });
    if (staleRows.length === 0) return 0;

    const staleIds = staleRows.map((row) => row.id);
    await tx.providerEntityMap.deleteMany({
      where: {
        provider,
        providerEntityType: "FANTASY_PLAYER_PRICE",
        providerEntityId: { in: staleIds },
        internalEntityType: "PLAYER"
      }
    });
    await tx.fantasyPlayerPrice.deleteMany({
      where: {
        id: { in: staleIds }
      }
    });
    return staleRows.length;
  });
}

function normalizePosition(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (["вр", "gk", "goalkeeper", "вратарь"].includes(normalized)) return "GK";
  if (["защ", "def", "defender", "защитник"].includes(normalized)) return "DEF";
  if (["пз", "mid", "midfielder", "полузащитник"].includes(normalized)) return "MID";
  if (["нап", "fwd", "forward", "нападающий"].includes(normalized)) return "FWD";
  return value;
}

function firstHeader(headers: Map<string, number>, names: string[]) {
  for (const name of names) {
    const match = headers.get(name);
    if (match) return match;
  }
  return null;
}

function normalizeHeader(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function cellString(cell: ExcelJS.Cell) {
  const value = cellValue(cell.value);
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value).trim() || null;
}

function cellNumber(cell: ExcelJS.Cell) {
  const value = cellValue(cell.value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === "object") {
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
    if ("text" in value) return value.text;
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if ("hyperlink" in value && "text" in value) return value.text;
  }
  return value;
}

function inferredMaxPlayersPerTeam(leagueName: string) {
  const value = leagueName.toLowerCase();
  return ["premier league", "la liga", "bundesliga", "serie a", "ligue 1"].some((name) => value.includes(name)) ? 3 : 2;
}

function expandSeasonLabel(season: string) {
  const match = season.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return season;
  return `${match[1]}/20${match[2]}`;
}

function providerLabel(provider: string) {
  return provider === "SPORTS_RU" ? "Sports.ru" : provider;
}

function parseArgs(argv: string[]): Args {
  const result: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function stringArg(value: string | boolean | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberArg(value: string | boolean | undefined) {
  if (typeof value !== "string") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
