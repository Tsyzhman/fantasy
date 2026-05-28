"use client";

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type TableHTMLAttributes } from "react";

import { localizedText, useLanguage } from "@/components/localized-option";

type SortDirection = "asc" | "desc";

type SortableTableProps = TableHTMLAttributes<HTMLTableElement> & {
  serverSortParam?: string;
  defaultSort?: string;
};

type ComparableValue =
  | { kind: "empty"; text: string }
  | { kind: "number"; number: number; text: string }
  | { kind: "date"; number: number; text: string }
  | { kind: "text"; text: string };

export function SortableTable({ className, serverSortParam, defaultSort, children, ...props }: SortableTableProps) {
  const language = useLanguage();
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    initializeHeaders(table, language);
    if (serverSortParam) syncServerSortHeaders(table, serverSortParam, defaultSort);
  }, [serverSortParam, defaultSort, children, language]);

  function sortFromEvent(target: EventTarget | null) {
    const table = tableRef.current;
    if (!table || !(target instanceof Element)) return;

    const header = target.closest("th");
    if (!header || !table.contains(header) || header.closest("table") !== table) return;
    if (header.dataset.sortable !== "true") return;

    if (serverSortParam && header.dataset.sortKey) {
      navigateToServerSort(table, header, serverSortParam);
      return;
    }

    sortTableBody(table, header);
  }

  function handleClick(event: MouseEvent<HTMLTableElement>) {
    sortFromEvent(event.target);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    sortFromEvent(event.target);
    event.preventDefault();
  }

  return (
    <table
      {...props}
      ref={tableRef}
      className={["sortable-table", className].filter(Boolean).join(" ")}
      data-default-sort={defaultSort}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </table>
  );
}

function initializeHeaders(table: HTMLTableElement, language: "en" | "ru") {
  const headers = table.tHead ? Array.from(table.tHead.querySelectorAll("th")) : [];
  for (const header of headers) {
    if (header.dataset.sortDisabled === "true") continue;
    if (!header.dataset.sortKey && !header.textContent?.trim()) {
      header.dataset.sortDisabled = "true";
      continue;
    }

    header.dataset.sortable = "true";
    header.tabIndex = 0;
    header.setAttribute("role", "button");
    header.setAttribute("aria-keyshortcuts", "Enter Space");
    header.setAttribute("aria-sort", header.getAttribute("aria-sort") ?? "none");
    header.setAttribute("aria-roledescription", localizedText(language, "sortable column header", "сортируемый заголовок столбца"));
  }
}

function sortTableBody(table: HTMLTableElement, header: HTMLTableCellElement) {
  const body = table.tBodies[0];
  if (!body) return;

  const columnIndex = header.cellIndex;
  const currentDirection = readSortDirection(header.dataset.sortDirection);
  const defaultDirection = defaultDirectionForColumn(table, columnIndex, header);
  const nextDirection = currentDirection ? reverseDirection(currentDirection) : defaultDirection;
  const rows = Array.from(body.rows);
  const sortableRows = rows
    .map((row, index) => ({ row, index, value: comparableValue(cellSortValue(row.cells[columnIndex])) }))
    .filter((entry) => rowCanSort(entry.row, columnIndex));
  const pinnedRows = rows.filter((row) => !rowCanSort(row, columnIndex));

  sortableRows.sort((left, right) => {
    const result = compareValues(left.value, right.value);
    return (nextDirection === "asc" ? result : -result) || left.index - right.index;
  });

  for (const entry of sortableRows) body.appendChild(entry.row);
  for (const row of pinnedRows) body.appendChild(row);

  markActiveHeader(table, header, nextDirection);
}

function navigateToServerSort(table: HTMLTableElement, header: HTMLTableCellElement, sortParam: string) {
  const key = header.dataset.sortKey;
  if (!key) return;

  const url = new URL(window.location.href);
  const current = parseSortValue(url.searchParams.get(sortParam) ?? table.dataset.defaultSort ?? "");
  const currentDirection = current.key === key ? current.direction ?? defaultDirectionForColumn(table, header.cellIndex, header) : null;
  const nextDirection = currentDirection ? reverseDirection(currentDirection) : defaultDirectionForColumn(table, header.cellIndex, header);

  url.searchParams.set(sortParam, `${key}:${nextDirection}`);
  url.searchParams.delete("page");
  window.location.assign(url.toString());
}

function syncServerSortHeaders(table: HTMLTableElement, sortParam: string, defaultSort?: string) {
  const rawSort = new URL(window.location.href).searchParams.get(sortParam) ?? defaultSort ?? "";
  const current = parseSortValue(rawSort);
  if (!current.key) return;

  const header = Array.from(table.tHead?.querySelectorAll("th[data-sort-key]") ?? []).find(
    (candidate) => candidate instanceof HTMLTableCellElement && candidate.dataset.sortKey === current.key
  );
  if (!(header instanceof HTMLTableCellElement)) return;

  markActiveHeader(table, header, current.direction ?? defaultDirectionForColumn(table, header.cellIndex, header));
}

function markActiveHeader(table: HTMLTableElement, activeHeader: HTMLTableCellElement, direction: SortDirection) {
  for (const header of Array.from(table.tHead?.querySelectorAll("th") ?? [])) {
    header.removeAttribute("data-sort-direction");
    header.setAttribute("aria-sort", "none");
  }

  activeHeader.dataset.sortDirection = direction;
  activeHeader.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
}

function rowCanSort(row: HTMLTableRowElement, columnIndex: number) {
  const cell = row.cells[columnIndex];
  if (!cell) return false;
  return row.cells.length > 1 && cell.colSpan === 1;
}

function cellSortValue(cell: HTMLTableCellElement | undefined) {
  if (!cell) return "";

  const explicitValue = cell.getAttribute("data-sort-value");
  if (explicitValue !== null) return explicitValue;

  const select = cell.querySelector("select");
  if (select) return select.selectedOptions[0]?.textContent ?? select.value;

  const input = cell.querySelector("input");
  if (input instanceof HTMLInputElement) {
    if (input.type === "checkbox" || input.type === "radio") return input.checked ? "1" : "0";
    return input.value;
  }

  return cell.textContent ?? "";
}

function comparableValue(value: string): ComparableValue {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text === "-") return { kind: "empty", text };

  const date = parseDateValue(text);
  if (date !== null) return { kind: "date", number: date, text };

  const number = parseNumberValue(text);
  if (number !== null) return { kind: "number", number, text };

  return { kind: "text", text: text.toLocaleLowerCase() };
}

function compareValues(left: ComparableValue, right: ComparableValue) {
  if (left.kind === "empty" && right.kind === "empty") return 0;
  if (left.kind === "empty") return 1;
  if (right.kind === "empty") return -1;

  if ("number" in left && "number" in right) return left.number - right.number;
  return left.text.localeCompare(right.text, undefined, { numeric: true, sensitivity: "base" });
}

function parseDateValue(text: string) {
  if (!/^(?:\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})$/.test(text)) return null;

  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseNumberValue(text: string) {
  const compact = text.replace(/,/g, "").trim().toLocaleLowerCase();
  if (!/^(?:(?:eur|usd|rub|gbp|€|\$|£)\s*)?-?\d+(?:\.\d+)?\s*(?:m|k|%)?(?:\s*(?:\/|:)\s*-?\d+(?:\.\d+)?\s*(?:m|k|%)?)?$/.test(compact)) {
    return null;
  }

  const match = compact.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  let value = Number(match[0]);
  if (!Number.isFinite(value)) return null;

  const suffix = compact.slice((match.index ?? 0) + match[0].length).trim();
  if (suffix.startsWith("m")) value *= 1_000_000;
  if (suffix.startsWith("k")) value *= 1_000;

  return value;
}

function defaultDirectionForColumn(table: HTMLTableElement, columnIndex: number, header: HTMLTableCellElement): SortDirection {
  const explicitDirection = readSortDirection(header.dataset.sortDefaultDirection);
  if (explicitDirection) return explicitDirection;

  const rows = Array.from(table.tBodies[0]?.rows ?? []).filter((row) => rowCanSort(row, columnIndex)).slice(0, 12);
  const values = rows.map((row) => comparableValue(cellSortValue(row.cells[columnIndex]))).filter((value) => value.kind !== "empty");
  return values.some((value) => value.kind === "number" || value.kind === "date") ? "desc" : "asc";
}

function parseSortValue(value: string) {
  const [key, direction] = value.split(":");
  return {
    key: key || "",
    direction: readSortDirection(direction)
  };
}

function readSortDirection(value: string | undefined): SortDirection | null {
  return value === "asc" || value === "desc" ? value : null;
}

function reverseDirection(direction: SortDirection): SortDirection {
  return direction === "asc" ? "desc" : "asc";
}
