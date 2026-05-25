import type { Prisma, PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

import { normalizeSportsRuPlayerName } from "@/lib/providers/sports-ru-fantasy";

import { autoMapSportsRuFantasyPlayers } from "./sports_ru_player_mapping";

export type ParsedFantasyPriceRow = {
  rowNumber: number;
  playerName: string;
  normalizedName: string;
  fotmobPlayerName: string | null;
  sportsTeamName: string;
  teamName: string;
  position: string | null;
  price: number;
  raw: Record<string, unknown>;
};

export type ParsedFantasyPriceSheet = {
  sheetName: string;
  rows: ParsedFantasyPriceRow[];
};

type PriceSheetColumns = {
  fotmobPlayerNameCol: number | null;
  fcCol: number | null;
  nameCol: number;
  clubCol: number;
  positionCol: number;
  priceCol: number;
};

export async function importFantasyPriceWorkbook(
  prisma: PrismaClient,
  workbook: ExcelJS.Workbook,
  input: {
    leagueId: bigint;
    requestedSeason: string;
    provider?: string;
    sheetName?: string | null;
    budgetLimit?: number | null;
    squadSize?: number | null;
    maxPlayersPerTeam?: number | null;
    replace?: boolean;
    sourceLabel?: string | null;
  }
) {
  const provider = input.provider ?? "SPORTS_RU";
  const parsed = parseFantasyPriceWorkbook(workbook, { sheetName: input.sheetName ?? null });
  const leagueSeason = await findLeagueSeason(prisma, input.leagueId, input.requestedSeason);
  if (!leagueSeason) {
    throw new Error(`League season not found: ${input.leagueId} ${input.requestedSeason}`);
  }

  const season = leagueSeason.season;
  const importedAt = new Date();
  await prisma.sportsRuFantasyContest.upsert({
    where: {
      provider_leagueId_season: {
        provider,
        leagueId: input.leagueId,
        season
      }
    },
    update: {
      name: `${providerLabel(provider)} ${leagueSeason.league.name}`,
      budgetLimit: input.budgetLimit ?? 100,
      squadSize: input.squadSize ?? 15,
      maxPlayersPerTeam: input.maxPlayersPerTeam ?? inferredMaxPlayersPerTeam(leagueSeason.league.name),
      sourceUrl: input.sourceLabel ?? null,
      rules: {
        source: "xlsx",
        sheetName: parsed.sheetName,
        importedAt: importedAt.toISOString()
      },
      lastSyncedAt: importedAt
    },
    create: {
      leagueId: input.leagueId,
      season,
      provider,
      name: `${providerLabel(provider)} ${leagueSeason.league.name}`,
      budgetLimit: input.budgetLimit ?? 100,
      squadSize: input.squadSize ?? 15,
      maxPlayersPerTeam: input.maxPlayersPerTeam ?? inferredMaxPlayersPerTeam(leagueSeason.league.name),
      sourceUrl: input.sourceLabel ?? null,
      rules: {
        source: "xlsx",
        sheetName: parsed.sheetName,
        importedAt: importedAt.toISOString()
      },
      lastSyncedAt: importedAt
    }
  });

  const importedIds: string[] = [];
  for (const row of parsed.rows) {
    const price = await prisma.fantasyPlayerPrice.upsert({
      where: {
        provider_leagueId_season_normalizedName_teamName: {
          provider,
          leagueId: input.leagueId,
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
        lastSeenAt: importedAt
      },
      create: {
        leagueId: input.leagueId,
        season,
        provider,
        playerName: row.playerName,
        normalizedName: row.normalizedName,
        teamName: row.teamName,
        position: row.position,
        price: row.price,
        raw: row.raw as Prisma.InputJsonValue,
        lastSeenAt: importedAt
      }
    });
    importedIds.push(price.id);
  }

  const deleted = input.replace && importedIds.length > 0 ? await deleteRowsNotInImport(prisma, provider, input.leagueId, season, importedIds) : 0;
  const mapping = await autoMapSportsRuFantasyPlayers(prisma, { leagueId: input.leagueId, season });

  return {
    leagueName: leagueSeason.league.name,
    season,
    sheetName: parsed.sheetName,
    imported: parsed.rows.length,
    deleted,
    mapped: mapping.matched,
    manual: mapping.manual,
    unmatched: mapping.unmatched
  };
}

export function parseFantasyPriceWorkbook(workbook: ExcelJS.Workbook, input: { sheetName: string | null }): ParsedFantasyPriceSheet {
  const worksheet = input.sheetName ? workbook.getWorksheet(input.sheetName) : findPriceSheet(workbook);
  if (!worksheet) throw new Error(input.sheetName ? `Sheet was not found: ${input.sheetName}` : "Could not find a price sheet.");

  const header = findPriceHeader(worksheet);
  if (!header) throw new Error(`Could not find price columns in sheet "${worksheet.name}".`);

  const teamAliases = buildTeamAliases(worksheet);
  const rows: ParsedFantasyPriceRow[] = [];
  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const playerName = cellString(row.getCell(header.columns.nameCol));
    const fotmobPlayerName = header.columns.fotmobPlayerNameCol ? cellString(row.getCell(header.columns.fotmobPlayerNameCol)) : null;
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
      fotmobPlayerName,
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
        fcTeamName,
        fotmobPlayerName
      }
    });
  }

  return {
    sheetName: worksheet.name,
    rows
  };
}

export function expandSeasonLabel(season: string) {
  const match = season.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return season;
  return `${match[1]}/20${match[2]}`;
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
      if (value && !headers.has(value)) headers.set(value, col);
    }

    const nameCol = firstHeader(headers, ["\u0438\u043c\u044f", "\u0438\u0433\u0440\u043e\u043a", "player", "name"]);
    const clubCol = firstHeader(headers, ["\u043a\u043b\u0443\u0431", "\u043a\u043e\u043c\u0430\u043d\u0434\u0430", "team", "club"]);
    const positionCol = firstHeader(headers, ["\u043f\u043e\u0437\u0438\u0446\u0438\u044f", "\u043f\u043e\u0437", "position", "pos"]);
    const priceCol = firstHeader(headers, ["\u0446\u0435\u043d\u0430", "price", "\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c"]);
    if (nameCol && clubCol && positionCol && priceCol) {
      return {
        rowNumber,
        columns: {
          fotmobPlayerNameCol: firstHeader(headers, ["fotmob", "fotmob name", "fot mob", "fotmob player"]),
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
      if (left !== "\u0441\u043f\u043e\u0440\u0442\u0441" || right !== "fotmob") continue;

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

async function findLeagueSeason(prisma: PrismaClient, leagueId: bigint, requestedSeason: string) {
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

function deleteRowsNotInImport(prisma: PrismaClient, provider: string, leagueId: bigint, season: string, importedIds: string[]) {
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
  const compact = normalized.replace(/[\s._/-]+/g, "");
  if (["\u0432\u0440", "\u0432\u0440\u0442", "gk", "goalkeeper", "\u0432\u0440\u0430\u0442\u0430\u0440\u044c", "\u0432\u0440\u0430\u0442\u0430\u0440\u0438"].includes(compact)) return "GK";
  if (["\u0437", "\u0437\u0449", "\u0437\u0430\u0449", "def", "defender", "\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a", "\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a\u0438"].includes(compact)) return "DEF";
  if (["\u043f", "\u043f\u0437", "mid", "midfielder", "\u043f\u043e\u043b\u0443\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a", "\u043f\u043e\u043b\u0443\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a\u0438"].includes(compact)) return "MID";
  if (["\u043d", "\u043d\u043f", "\u043d\u0430\u043f", "fwd", "forward", "\u0444\u043e\u0440\u0432\u0430\u0440\u0434", "\u043d\u0430\u043f\u0430\u0434\u0430\u044e\u0449\u0438\u0439", "\u043d\u0430\u043f\u0430\u0434\u0430\u044e\u0449\u0438\u0435"].includes(compact)) return "FWD";
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

function providerLabel(provider: string) {
  return provider === "SPORTS_RU" ? "Sports.ru" : provider;
}
