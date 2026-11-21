import type ExcelJS from "exceljs";

import { toCsv, type CsvColumn } from "@/lib/csv";

export type TableExportFormat = "csv" | "xlsx";

type TableSheet<T> = {
  rows: T[];
  columns: CsvColumn<T>[];
};

type TableExportOptions<T, U> = TableSheet<T> & {
  format: TableExportFormat;
  filename: string;
  sheetName?: string;
  additionalSheets?: Array<TableSheet<U> & { sheetName: string }>;
};

const xlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function tableExportResponse<T, U = never>({
  rows, columns, format, filename, sheetName = "Export", additionalSheets = []
}: TableExportOptions<T, U>) {
  const safeFilename = safeExportFilename(filename);

  if (format === "csv") {
    return new Response(toCsv(rows, columns), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename}.csv"`
      }
    });
  }

  const { default: ExcelJSLib } = await import("exceljs");
  const workbook = new ExcelJSLib.Workbook();
  addTableSheet(workbook, sheetName, { rows, columns });
  for (const sheet of additionalSheets) addTableSheet(workbook, sheet.sheetName, sheet);
  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": xlsxContentType,
      "Content-Disposition": `attachment; filename="${safeFilename}.xlsx"`
    }
  });
}

function addTableSheet<T>(workbook: ExcelJS.Workbook, name: string, { columns, rows }: TableSheet<T>) {
  const worksheet = workbook.addWorksheet(safeSheetName(name));
  worksheet.columns = columns.map(column => ({ header: column.header, key: column.header }));
  worksheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    worksheet.addRow(columns.map(column => normalizeExportCell(column.value(row))));
  }
  autosizeColumns(worksheet);
}

export function parseTableExportFormat(
  value: string | null | undefined,
  fallback: TableExportFormat | null = "csv"
): TableExportFormat | null {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === "csv" || normalized === "xlsx") return normalized;
  return null;
}

function normalizeExportCell(value: unknown): ExcelJS.CellValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  return String(value);
}

function autosizeColumns(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = String(column.header ?? "").length;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      const text = value instanceof Date ? value.toISOString() : value === null || value === undefined ? "" : String(value);
      maxLength = Math.max(maxLength, text.length);
    });
    column.width = Math.min(Math.max(maxLength + 2, 12), 42);
  });
}

function safeSheetName(value: string) {
  const cleaned = value.replace(/[\[\]:*?/\\]/g, " ").trim();
  return (cleaned || "Export").slice(0, 31);
}

function safeExportFilename(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "export"
  );
}
