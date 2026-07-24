"use client";

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type TableHTMLAttributes } from "react";

import { localizedText, useLanguage } from "@/components/localized-option";

type SortDirection = "asc" | "desc";

type SortableTableProps = TableHTMLAttributes<HTMLTableElement> & {
  serverSortParam?: string;
  defaultSort?: string;
  sortRefreshKey?: string | number;
  onClientSortChange?: (sort: { key: string; direction: SortDirection }) => void;
};

type ComparableValue =
  | { kind: "empty"; text: string }
  | { kind: "number"; number: number; text: string }
  | { kind: "date"; number: number; text: string }
  | { kind: "text"; text: string };

export function SortableTable({ className, serverSortParam, defaultSort, sortRefreshKey, onClientSortChange, children, ...props }: SortableTableProps) {
  const language = useLanguage();
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    initializeHeaders(table, language);
    if (serverSortParam) {
      syncServerSortHeaders(table, serverSortParam, defaultSort);
      return;
    }

    const activeHeader = Array.from(table.tHead?.querySelectorAll("th[data-sort-direction]") ?? []).find(
      (header): header is HTMLTableCellElement => header instanceof HTMLTableCellElement
    );
    const direction = activeHeader ? readSortDirection(activeHeader.dataset.sortDirection) : null;
    if (activeHeader && direction) sortTableBody(table, activeHeader, direction);
  }, [serverSortParam, defaultSort, children, language]);

  useEffect(() => {
    const table = tableRef.current;
    if (!table || sortRefreshKey === undefined) return;
    const activeHeader = Array.from(table.tHead?.querySelectorAll("th[data-sort-direction]") ?? []).find(
      (header): header is HTMLTableCellElement => header instanceof HTMLTableCellElement
    );
    const direction = activeHeader ? readSortDirection(activeHeader.dataset.sortDirection) : null;
    if (activeHeader && direction) sortTableBody(table, activeHeader, direction);
  }, [sortRefreshKey]);

  function sortFromEvent(target: EventTarget | null) {
    const table = tableRef.current;
    if (!table || !(target instanceof Element)) return;
    if (target.closest("[data-column-resize-handle]")) return;

    const header = target.closest("th");
    if (!header || !table.contains(header) || header.closest("table") !== table) return;
    if (header.dataset.sortable !== "true") return;

    if (serverSortParam && header.dataset.sortKey) {
      navigateToServerSort(table, header, serverSortParam);
      return;
    }

    sortTableBody(table, header);
    const direction = readSortDirection(header.dataset.sortDirection);
    if (direction) {
      onClientSortChange?.({ key: header.dataset.sortKey ?? header.textContent?.trim() ?? "", direction });
      table.dispatchEvent(new CustomEvent("sortable-table:sort-change", {
        bubbles: true,
        detail: { key: header.dataset.sortKey ?? header.textContent?.trim() ?? "", direction }
      }));
    }
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
    header.setAttribute("aria-keyshortcuts", "Enter Space");
    header.setAttribute("aria-sort", header.getAttribute("aria-sort") ?? "none");
    header.setAttribute("aria-roledescription", localizedText(language, "sortable column header", "сортируемый заголовок столбца"));
  }
}

function sortTableBody(table: HTMLTableElement, header: HTMLTableCellElement, forcedDirection?: SortDirection) {
  const body = table.tBodies[0];
  if (!body) return;

  const columnIndex = header.cellIndex;
  const currentDirection = readSortDirection(header.dataset.sortDirection);
  const defaultDirection = defaultDirectionForColumn(table, columnIndex, header);
  const nextDirection = forcedDirection ?? (currentDirection ? reverseDirection(currentDirection) : defaultDirection);
  const rows = Array.from(body.rows);
  const rowGroups = groupTableRows(rows);
  const sortableRows = rowGroups
    .map((group, index) => ({ group, index, value: comparableValue(cellSortValue(group.row.cells[columnIndex])) }))
    .filter((entry) => rowCanSort(entry.group.row, columnIndex));
  const pinnedRows = rowGroups.filter((group) => !rowCanSort(group.row, columnIndex));

  sortableRows.sort((left, right) => {
    const result = compareSortableValues(left.value, right.value, nextDirection);
    return result || left.index - right.index;
  });

  for (const entry of sortableRows) appendRowGroup(body, entry.group);
  for (const group of pinnedRows) appendRowGroup(body, group);

  markActiveHeader(table, header, nextDirection);
}

function groupTableRows(rows: HTMLTableRowElement[]) {
  const groups: Array<{ row: HTMLTableRowElement; detailRows: HTMLTableRowElement[] }> = [];
  for (const row of rows) {
    if (row.dataset.sortDetailRow === "true" && groups.length > 0) {
      groups[groups.length - 1].detailRows.push(row);
    } else {
      groups.push({ row, detailRows: [] });
    }
  }
  return groups;
}

function appendRowGroup(body: HTMLTableSectionElement, group: { row: HTMLTableRowElement; detailRows: HTMLTableRowElement[] }) {
  body.appendChild(group.row);
  for (const detailRow of group.detailRows) body.appendChild(detailRow);
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

export function compareSortableValues(left: ComparableValue, right: ComparableValue, direction: SortDirection) {
  if (left.kind === "empty" && right.kind === "empty") return 0;
  if (left.kind === "empty") return 1;
  if (right.kind === "empty") return -1;

  const result = "number" in left && "number" in right
    ? left.number - right.number
    : left.text.localeCompare(right.text, undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
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
