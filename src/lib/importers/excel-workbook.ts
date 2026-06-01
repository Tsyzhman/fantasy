import type ExcelJS from "exceljs";

export type FirstWorksheetTable = {
  sheetName: string;
  table: unknown[][];
};

export async function readFirstWorksheetTable(buffer: Buffer): Promise<FirstWorksheetTable | null> {
  const { default: ExcelJSLib } = await import("exceljs");
  const workbook = new ExcelJSLib.Workbook();
  const workbookBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await workbook.xlsx.load(workbookBuffer as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);

  const sheet = workbook.worksheets[0];
  if (!sheet) return null;

  const table: unknown[][] = [];
  const columnCount = sheet.columnCount;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: unknown[] = [];
    let hasValue = false;

    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
      const value = normalizeCellValue(row.getCell(columnIndex).value);
      values.push(value);
      if (value !== null && value !== "") hasValue = true;
    }

    if (hasValue) table.push(values);
  });

  return {
    sheetName: sheet.name,
    table
  };
}

export function parseExcelSerialDate(value: number) {
  if (!Number.isFinite(value)) return null;

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const excelEpoch = Date.UTC(1899, 11, 30);
  const date = new Date(excelEpoch + value * millisecondsPerDay);

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCellValue(value: ExcelJS.CellValue): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;

  if ("result" in value) return normalizeCellValue(value.result as ExcelJS.CellValue);
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }

  return String(value);
}
