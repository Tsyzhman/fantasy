import { parseExcelSerialDate, readFirstWorksheetTable } from "@/lib/importers/excel-workbook";
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
  fantasyAssists: number | null;
  cleanSheets: number | null;
  saves: number | null;
  penaltySaves: number | null;
  recoveries: number | null;
  penaltiesConceded: number | null;
  missedPenalties: number | null;
  ownGoals: number | null;
  goalsConceded: number | null;
  shotsOnTarget: number | null;
  keyPasses: number | null;
  tacklesWon: number | null;
  interceptions: number | null;
  clearances: number | null;
  yellowCards: number | null;
  redCards: number | null;
  averageRating: number | null;
  birthCountry: string | null;
  passportCountry: string | null;
  foot: string | null;
  heightCm: number | null;
  weightKg: number | null;
  onLoan: boolean | null;
  scoringMetrics: Record<string, unknown>;
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
  "matches_played",
  "minutes_played",
  "goals",
  "xg",
  "assists",
  "xa",
  "shots_on_target",
  "key_passes",
  "tackles_won",
  "interceptions",
  "clearances",
  "yellow_cards",
  "red_cards",
  "average_rating",
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

export async function parseWyscoutWorkbook(
  buffer: Buffer,
  expectedTeam: { name: string }
): Promise<WyscoutParseResult> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const worksheet = await readFirstWorksheetTable(buffer);

  if (!worksheet) {
    return {
      columns: [],
      rows: [],
      detectedTeamName: null,
      errors: [{ code: "EMPTY_WORKBOOK", message: "The workbook does not contain any worksheets." }],
      warnings
    };
  }

  const table = worksheet.table;

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
    .map((row, rowIndex) => normalizeRow(headers, row, rowIndex + headerIndex + 2, expectedTeam.name, warnings))
    .filter((row): row is ParsedPlayerSnapshot => row !== null);

  const detectedTeamName = rows.length > 0 ? expectedTeam.name : null;

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
    if (headers.includes("player") && (headers.includes("team") || headers.includes("position"))) {
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
  targetTeamName: string,
  warnings: ImportIssue[]
): ParsedPlayerSnapshot | null {
  const rawMetrics: Record<string, unknown> = {};

  headers.forEach((header, index) => {
    const value = sanitizeCellValue(row[index]);
    rawMetrics[header] = numericFields.has(header) ? coerceNumber(value, header, sourceRowNumber, warnings) : value;
  });

  const playerName = stringValue(rawMetrics.player);
  const sourceTeamName = stringValue(rawMetrics.team);
  const teamName = targetTeamName;

  if (!playerName && !sourceTeamName) return null;
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
  rawMetrics.team = teamName;
  const matchesPlayed = coerceInteger(rawMetrics.matches_played);
  const minutesPlayed = coerceInteger(rawMetrics.minutes_played);
  const goals = coerceNumber(rawMetrics.goals);
  const xg = coerceNumber(rawMetrics.xg);
  const assists = coerceNumber(rawMetrics.assists);
  const xa = coerceNumber(rawMetrics.xa);
  const fantasyAssists = coerceInteger(rawMetrics.fantasy_assists);
  const cleanSheets = coerceInteger(rawMetrics.clean_sheets);
  const saves = coerceInteger(rawMetrics.saves);
  const penaltySaves = coerceInteger(rawMetrics.penalty_saves ?? rawMetrics.penalties_saved);
  const recoveries = coerceInteger(rawMetrics.recoveries ?? rawMetrics.possession_recoveries);
  const penaltiesConceded = coerceInteger(rawMetrics.penalties_conceded ?? rawMetrics.fouls_leading_to_penalty);
  const missedPenalties = coerceInteger(rawMetrics.missed_penalties ?? rawMetrics.penalties_missed);
  const ownGoals = coerceInteger(rawMetrics.own_goals);
  const goalsConceded = coerceInteger(rawMetrics.goals_conceded ?? rawMetrics.conceded_goals);
  const shotsOnTarget = coerceInteger(rawMetrics.shots_on_target);
  const keyPasses = coerceInteger(rawMetrics.key_passes);
  const tacklesWon = coerceInteger(rawMetrics.tackles_won ?? rawMetrics.tackles);
  const interceptions = coerceInteger(rawMetrics.interceptions);
  const clearances = coerceInteger(rawMetrics.clearances);
  const yellowCards = coerceInteger(rawMetrics.yellow_cards);
  const redCards = coerceInteger(rawMetrics.red_cards);
  const averageRating = coerceNumber(rawMetrics.average_rating);

  return {
    playerName,
    normalizedName: normalizeName(playerName),
    teamName,
    positionRaw,
    positionGroup: normalizePositionGroup(positionRaw),
    age: coerceInteger(rawMetrics.age),
    marketValue,
    contractExpires: parseDate(rawMetrics.contract_expires),
    matchesPlayed,
    minutesPlayed,
    goals,
    xg,
    assists,
    xa,
    fantasyAssists,
    cleanSheets,
    saves,
    penaltySaves,
    recoveries,
    penaltiesConceded,
    missedPenalties,
    ownGoals,
    goalsConceded,
    shotsOnTarget,
    keyPasses,
    tacklesWon,
    interceptions,
    clearances,
    yellowCards,
    redCards,
    averageRating,
    birthCountry: nullableString(rawMetrics.birth_country),
    passportCountry: nullableString(rawMetrics.passport_country),
    foot: nullableString(rawMetrics.foot),
    heightCm: coerceInteger(rawMetrics.height),
    weightKg: coerceInteger(rawMetrics.weight),
    onLoan: coerceBoolean(rawMetrics.on_loan),
    scoringMetrics: scoringMetrics({
      matchesPlayed,
      minutesPlayed,
      goals,
      xg,
      assists,
      xa,
      fantasyAssists,
      cleanSheets,
      saves,
      penaltySaves,
      recoveries,
      penaltiesConceded,
      missedPenalties,
      ownGoals,
      goalsConceded,
      shotsOnTarget,
      keyPasses,
      tacklesWon,
      interceptions,
      clearances,
      yellowCards,
      redCards,
      averageRating
    })
  };
}

function scoringMetrics(values: Pick<ParsedPlayerSnapshot,
  | "matchesPlayed"
  | "minutesPlayed"
  | "goals"
  | "xg"
  | "assists"
  | "xa"
  | "fantasyAssists"
  | "cleanSheets"
  | "saves"
  | "penaltySaves"
  | "recoveries"
  | "penaltiesConceded"
  | "missedPenalties"
  | "ownGoals"
  | "goalsConceded"
  | "shotsOnTarget"
  | "keyPasses"
  | "tacklesWon"
  | "interceptions"
  | "clearances"
  | "yellowCards"
  | "redCards"
  | "averageRating"
>) {
  return {
    matches_played: values.matchesPlayed ?? 0,
    minutes_played: values.minutesPlayed ?? 0,
    goals: values.goals ?? 0,
    xg: values.xg ?? 0,
    assists: values.assists ?? 0,
    xa: values.xa ?? 0,
    fantasy_assists: values.fantasyAssists ?? 0,
    clean_sheets: values.cleanSheets ?? 0,
    saves: values.saves ?? 0,
    penalty_saves: values.penaltySaves ?? 0,
    penalties_saved: values.penaltySaves ?? 0,
    recoveries: values.recoveries ?? 0,
    possession_recoveries: values.recoveries ?? 0,
    penalties_conceded: values.penaltiesConceded ?? 0,
    fouls_leading_to_penalty: values.penaltiesConceded ?? 0,
    missed_penalties: values.missedPenalties ?? 0,
    penalties_missed: values.missedPenalties ?? 0,
    own_goals: values.ownGoals ?? 0,
    goals_conceded: values.goalsConceded ?? 0,
    conceded_goals: values.goalsConceded ?? 0,
    shots_on_target: values.shotsOnTarget ?? 0,
    key_passes: values.keyPasses ?? 0,
    tackles_won: values.tacklesWon ?? 0,
    tackles: values.tacklesWon ?? 0,
    interceptions: values.interceptions ?? 0,
    clearances: values.clearances ?? 0,
    yellow_cards: values.yellowCards ?? 0,
    red_cards: values.redCards ?? 0,
    average_rating: values.averageRating ?? 0
  };
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
    return parseExcelSerialDate(value);
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
    .replace(/[\u20ac\u00a3$]/g, "")
    .replace(/\b(?:eur|gbp|usd)\b/gi, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");

  const match = text.match(/^(\d+(?:\.\d+)?)(m|mn|k)?$/i);
  if (!match) return coerceInteger(value);

  const amount = Number(match[1]);
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "m" || suffix === "mn" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.round(amount * multiplier);
}
