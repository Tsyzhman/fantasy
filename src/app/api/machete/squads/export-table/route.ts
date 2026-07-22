import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import type { CsvColumn } from "@/lib/csv";
import { readJsonObject } from "@/lib/request-json";
import { tableExportResponse } from "@/lib/table-export";
import { isSquadTableColumnsInput } from "@/machete/squad-table-columns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlayerTableExportCell = string | number | null;
type PlayerTableExportRow = Record<string, PlayerTableExportCell>;
type PlayerTableExportColumn = { key: string; header: string };

const fixedColumnKeys = ["player", "team", "position", "price"] as const;

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const body = await readJsonObject(request);
  if (!Array.isArray(body.rows) || body.rows.length > 1_000) {
    return jsonError("BAD_REQUEST", "rows must contain at most 1000 player rows.", 400);
  }

  const requestedColumns = parseColumns(body.columns);
  if (!requestedColumns) {
    return jsonError("BAD_REQUEST", "columns must contain the fixed columns followed by valid selected player-table columns.", 400);
  }
  const rows = body.rows.map((row) => parseRow(row, requestedColumns));
  if (rows.some((row) => row === null)) {
    return jsonError("BAD_REQUEST", "Every export row must contain valid typed values for every selected column.", 400);
  }

  const language = body.language === "en" ? "en" : "ru";
  const leagueId = boundedText(body.leagueId, 32) || "league";
  const season = boundedText(body.season, 32).replaceAll("/", "-") || "season";
  const columns: CsvColumn<PlayerTableExportRow>[] = requestedColumns.map((column) => ({
    header: column.header,
    value: (row) => row[column.key]
  }));

  return tableExportResponse({
    rows: rows as PlayerTableExportRow[],
    columns,
    format: "xlsx",
    filename: `players-${leagueId}-${season}`,
    sheetName: language === "en" ? "Players" : "Игроки"
  });
});

function parseColumns(value: unknown): PlayerTableExportColumn[] | null {
  if (!Array.isArray(value) || value.length < fixedColumnKeys.length || value.length > 104) return null;
  const columns: PlayerTableExportColumn[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const source = item as Record<string, unknown>;
    const key = typeof source.key === "string" ? source.key : "";
    const header = boundedText(source.header, 120).trim();
    if (!key || !header || seen.has(key)) return null;
    seen.add(key);
    columns.push({ key, header });
  }
  if (fixedColumnKeys.some((key, index) => columns[index]?.key !== key)) return null;
  if (!isSquadTableColumnsInput(columns.slice(fixedColumnKeys.length).map((column) => column.key))) return null;
  return columns;
}

function parseRow(value: unknown, columns: PlayerTableExportColumn[]): PlayerTableExportRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const row: PlayerTableExportRow = {};
  for (const column of columns) {
    if (!Object.hasOwn(source, column.key)) return null;
    const cell = exportCell(source[column.key]);
    if (cell === undefined) return null;
    row[column.key] = cell;
  }
  if (typeof row.player !== "string" || typeof row.team !== "string" || typeof row.position !== "string") return null;
  if (row.price !== null && typeof row.price !== "number") return null;
  return row;
}

function exportCell(value: unknown): PlayerTableExportCell | undefined {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return boundedText(value, 500);
  return undefined;
}

function boundedText(value: unknown, maximumLength = 160) {
  return typeof value === "string" ? value.slice(0, maximumLength) : "";
}
