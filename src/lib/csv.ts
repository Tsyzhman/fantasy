export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
  return toDelimitedCsv(rows, columns, ",");
}

/** UTF-8 BOM and semicolon delimiter make CSV open into columns in Russian Excel. */
export function toExcelCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
  return `\uFEFF${toDelimitedCsv(rows, columns, ";")}`;
}

function toDelimitedCsv<T>(rows: T[], columns: CsvColumn<T>[], delimiter: "," | ";") {
  const lines = [columns.map((column) => escapeCsvCell(column.header, delimiter)).join(delimiter)];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(column.value(row), delimiter)).join(delimiter));
  }

  return `${lines.join("\r\n")}\r\n`;
}

function escapeCsvCell(value: unknown, delimiter: "," | ";") {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
