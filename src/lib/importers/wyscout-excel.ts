import * as XLSX from "xlsx";

import { normalizeName } from "@/lib/text";

export type ImportIssue = {
  code: string;
  message: string;
  details?: unknown;
};

export type ParsedPlayerSnapshot = {
  playerName: string;
  normalizedName: string;
  teamName: string;
  positionRaw: string | null;
  positionGroup: string;
  age: number | null;
  marketValue: number | null;
  contractExpires: Date | null;
  matchesPlayed: number | null;
  minutesPlayed: number | null;
  goals: number | null;
  xg: number | null;
  assists: number | null;
  xa: number | null;
  birthCountry: string | null;
  passportCountry: string | null;
  foot: string | null;
  heightCm: number | null;
  weightKg: number | null;
  onLoan: boolean | null;
  rawMetrics: Record<string, unknown>;
};

export type WyscoutParseResult = {
  columns: string[];
  rows: ParsedPlayerSnapshot[];
  detectedTeamName: string | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

const requiredColumns = [
  "player",
  "team",
  "position",
  "age",
  "market_value",
  "contract_expires",
  "matches_played",
  "minutes_played",
  "goals",
  "xg",
  "assists",
  "xa"
];

const numericFields = new Set([
  "age",
  "market_value",
  "matches_played",
  "minutes_played",
  "goals",
  "xg",
  "assists",
  "xa",
  "clean_sheets",
  "saves",
  "penalties_saved",
  "penalty_saves",
  "recoveries",
  "possession_recoveries",
  "fouls_leading_to_penalty",
  "penalties_conceded",
  "missed_penalties",
  "penalties_missed",
  "own_goals",
  "goals_conceded",
  "conceded_goals",
  "fantasy_assists",
  "height",
  "weight"
]);

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/%/g, "percent")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseWyscoutWorkbook(
  buffer: Buffer,
  expectedTeam: { name: string; aliases: string[] }
): WyscoutParseResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return {
      columns: [],
      rows: [],
      detectedTeamName: null,
      errors: [{ code: "EMPTY_WORKBOOK", message: "The workbook does not contain any worksheets." }],
      warnings
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true
  });

  const headerIndex = findHeaderRow(table);
  if (headerIndex === -1) {
    return {
      columns: [],
      rows: [],
      detectedTeamName: null,
      errors: [{ code: "HEADER_NOT_FOUND", message: "Could not find a Wyscout header row with Player and Team columns." }],
      warnings
    };
  }

  const headers = makeUniqueHeaders(table[headerIndex].map((value) => normalizeHeader(String(value ?? ""))));
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    errors.push({
      code: "MISSING_REQUIRED_COLUMNS",
      message: `Missing required Wyscout columns: ${missingColumns.join(", ")}`,
      details: missingColumns
    });
  }

  const rows = table
    .slice(headerIndex + 1)
    .map((row, rowIndex) => normalizeRow(headers, row, rowIndex + headerIndex + 2, warnings))
    .filter((row): row is ParsedPlayerSnapshot => row !== null);

  const detectedTeams = [...new Set(rows.map((row) => row.teamName).filter(Boolean))];
  const detectedTeamName = detectedTeams.length === 1 ? detectedTeams[0] : detectedTeams.join(", ") || null;

  validateTeam(expectedTeam, detectedTeams, errors);

  return {
    columns: headers,
    rows: errors.some((error) => error.code === "MISSING_REQUIRED_COLUMNS") ? [] : rows,
    detectedTeamName,
    errors,
    warnings
  };
}

function findHeaderRow(table: unknown[][]) {
  const scanLimit = Math.min(table.length, 10);
  for (let index = 0; index < scanLimit; index += 1) {
    const headers = table[index].map((value) => normalizeHeader(String(value ?? "")));
    if (headers.includes("player") && headers.includes("team")) {
      return index;
    }
  }

  return -1;
}

function makeUniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();

  return headers.map((header, index) => {
    const key = header || `unnamed_${index + 1}`;
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? key : `${key}_${count + 1}`;
  });
}

function normalizeRow(
  headers: string[],
  row: unknown[],
  sourceRowNumber: number,
  warnings: ImportIssue[]
): ParsedPlayerSnapshot | null {
  const rawMetrics: Record<string, unknown> = {};

  headers.forEach((header, index) => {
    const value = sanitizeCellValue(row[index]);
    rawMetrics[header] = numericFields.has(header) ? coerceNumber(value, header, sourceRowNumber, warnings) : value;
  });

  const playerName = stringValue(rawMetrics.player);
  const teamName = stringValue(rawMetrics.team);

  if (!playerName && !teamName) return null;
  if (!playerName) {
    warnings.push({
      code: "MISSING_PLAYER_NAME",
      message: `Skipped row ${sourceRowNumber}: missing Player value.`
    });
    return null;
  }

  const positionRaw = nullableString(rawMetrics.position);
  const marketValue = parseMarketValue(rawMetrics.market_value);
  rawMetrics.market_value = marketValue;

  return {
    playerName,
    normalizedName: normalizeName(playerName),
    teamName,
    positionRaw,
    positionGroup: normalizePositionGroup(positionRaw),
    age: coerceInteger(rawMetrics.age),
    marketValue,
    contractExpires: parseDate(rawMetrics.contract_expires),
    matchesPlayed: coerceInteger(rawMetrics.matches_played),
    minutesPlayed: coerceInteger(rawMetrics.minutes_played),
    goals: coerceNumber(rawMetrics.goals),
    xg: coerceNumber(rawMetrics.xg),
    assists: coerceNumber(rawMetrics.assists),
    xa: coerceNumber(rawMetrics.xa),
    birthCountry: nullableString(rawMetrics.birth_country),
    passportCountry: nullableString(rawMetrics.passport_country),
    foot: nullableString(rawMetrics.foot),
    heightCm: coerceInteger(rawMetrics.height),
    weightKg: coerceInteger(rawMetrics.weight),
    onLoan: coerceBoolean(rawMetrics.on_loan),
    rawMetrics: jsonSafe(rawMetrics)
  };
}

function validateTeam(expectedTeam: { name: string; aliases: string[] }, detectedTeams: string[], errors: ImportIssue[]) {
  if (detectedTeams.length === 0) {
    errors.push({ code: "TEAM_NOT_DETECTED", message: "No Team values were found in the uploaded file." });
    return;
  }

  if (detectedTeams.length > 1) {
    errors.push({
      code: "MULTIPLE_TEAMS_DETECTED",
      message: `The file contains multiple teams: ${detectedTeams.join(", ")}.`,
      details: detectedTeams
    });
    return;
  }

  const expectedNames = [expectedTeam.name, ...expectedTeam.aliases].map(normalizeName);
  const detectedName = normalizeName(detectedTeams[0]);
  if (!expectedNames.includes(detectedName)) {
    errors.push({
      code: "TEAM_MISMATCH",
      message: `Expected ${expectedTeam.name}, but the file contains ${detectedTeams[0]}.`,
      details: { expected: expectedTeam.name, aliases: expectedTeam.aliases, detected: detectedTeams[0] }
    });
  }
}

function normalizePositionGroup(positionRaw: string | null) {
  if (!positionRaw) return "UNKNOWN";
  const tokens = positionRaw
    .split(/[,/ ]+/)
    .map((token) => token.trim().toUpperCase().replace(/\d+$/g, ""))
    .filter(Boolean);

  if (tokens.some((token) => token === "GK")) return "GK";
  if (tokens.some((token) => ["CB", "LCB", "RCB", "LB", "RB", "LWB", "RWB"].includes(token))) return "DEF";
  if (tokens.some((token) => ["DMF", "CMF", "LCMF", "RCMF", "AMF", "MF"].includes(token))) return "MID";
  if (tokens.some((token) => ["LW", "RW", "LWF", "RWF", "CF", "ST", "FW"].includes(token))) return "FWD";
  return "UNKNOWN";
}

function sanitizeCellValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.trim();
  if (value === undefined) return null;
  return value;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function nullableString(value: unknown) {
  const text = stringValue(value);
  return text ? text : null;
}

function coerceNumber(value: unknown, metricKey?: string, rowNumber?: number, warnings?: ImportIssue[]) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(numeric)) return numeric;
  }

  if (metricKey && rowNumber && warnings) {
    warnings.push({
      code: "INVALID_NUMBER",
      message: `Could not parse ${metricKey} as a number on row ${rowNumber}.`,
      details: { metricKey, rowNumber, value }
    });
  }
  return null;
}

function coerceInteger(value: unknown) {
  const numeric = coerceNumber(value);
  return numeric === null ? null : Math.round(numeric);
}

function coerceBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = stringValue(value).toLowerCase();
  if (!text) return null;
  if (["yes", "true", "1", "y"].includes(text)) return true;
  if (["no", "false", "0", "n"].includes(text)) return false;
  return null;
}

function parseDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }

  const text = stringValue(value);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMarketValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Math.round(value);

  const text = String(value)
    .trim()
    .replace(/[€£$]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");

  const match = text.match(/^(\d+(?:\.\d+)?)(m|mn|k)?$/i);
  if (!match) return coerceInteger(value);

  const amount = Number(match[1]);
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "m" || suffix === "mn" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.round(amount * multiplier);
}

function jsonSafe(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, entry instanceof Date ? entry.toISOString() : entry])
  );
}
