import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import type { CsvColumn } from "@/lib/csv";
import { readJsonObject } from "@/lib/request-json";
import { tableExportResponse } from "@/lib/table-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportCell = string | number | null;
type ExportRow = Record<string, ExportCell>;
type ExportColumn = { key: string; header: string };
const requiredKeys = ["player"];

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const body = await readJsonObject(request);
  const columns = parseColumns(body.columns);
  if (!columns) return jsonError("BAD_REQUEST", "Invalid export columns.", 400);
  if (!Array.isArray(body.rows) || body.rows.length > 5_000) return jsonError("BAD_REQUEST", "rows must contain at most 5000 players.", 400);
  const rows = body.rows.map((row) => parseRow(row, columns));
  if (rows.some((row) => row === null)) return jsonError("BAD_REQUEST", "Invalid typed export row.", 400);
  const language = body.language === "en" ? "en" : "ru";
  const csvColumns: CsvColumn<ExportRow>[] = columns.map((column) => ({ header: column.header, value: (row) => row[column.key] }));
  return tableExportResponse({ rows: rows as ExportRow[], columns: csvColumns, format: "xlsx", filename: "machete-players", sheetName: language === "en" ? "Players" : "Игроки" });
});

function parseColumns(value: unknown): ExportColumn[] | null {
  if (!Array.isArray(value) || value.length < requiredKeys.length || value.length > 120) return null;
  const result: ExportColumn[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const source = item as Record<string, unknown>;
    const key = typeof source.key === "string" && /^[A-Za-z0-9:_-]{1,100}$/.test(source.key) ? source.key : "";
    const header = typeof source.header === "string" ? source.header.trim().slice(0, 120) : "";
    if (!key || !header || seen.has(key)) return null;
    seen.add(key);
    result.push({ key, header });
  }
  if (requiredKeys.some((key, index) => result[index]?.key !== key) || !seen.has("position")) return null;
  return result;
}

function parseRow(value: unknown, columns: ExportColumn[]): ExportRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const row: ExportRow = {};
  for (const column of columns) {
    if (!Object.hasOwn(source, column.key)) return null;
    const cell = source[column.key];
    if (cell !== null && typeof cell !== "string" && (typeof cell !== "number" || !Number.isFinite(cell))) return null;
    row[column.key] = typeof cell === "string" ? cell.slice(0, 500) : cell;
  }
  return row;
}
