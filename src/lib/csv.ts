export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
  const lines = [columns.map((column) => escapeCsvCell(column.header)).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(column.value(row))).join(","));
  }

  return `${lines.join("\r\n")}\r\n`;
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
