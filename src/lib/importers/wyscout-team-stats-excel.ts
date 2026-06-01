import { parseExcelSerialDate, readFirstWorksheetTable } from "@/lib/importers/excel-workbook";
import { normalizeName } from "@/lib/text";
import { normalizeHeader, type ImportIssue } from "@/lib/importers/wyscout-excel";

type TeamMatcherInput = {
  id: string;
  name: string;
  aliases: string[];
};

export type ParsedBaltikaTeamStatRow = {
  teamId: string | null;
  opponentTeamId: string | null;
  teamName: string;
  side: "HOME" | "AWAY";
  goals: number | null;
  xg: number | null;
  xga: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
};

export type ParsedBaltikaFixture = {
  kickoffAt: Date | null;
  matchLabel: string;
  competition: string | null;
  durationMinutes: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  homeXg: number | null;
  awayXg: number | null;
  rows: [ParsedBaltikaTeamStatRow, ParsedBaltikaTeamStatRow];
};

export type WyscoutTeamStatsParseResult = {
  columns: string[];
  fixtures: ParsedBaltikaFixture[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

const requiredColumns = ["date", "match", "team", "goals", "xg"];

export async function parseWyscoutTeamStatsWorkbook(
  buffer: Buffer,
  expectedHomeTeam: TeamMatcherInput,
  teams: TeamMatcherInput[]
): Promise<WyscoutTeamStatsParseResult> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const worksheet = await readFirstWorksheetTable(buffer);

  if (!worksheet) {
    return {
      columns: [],
      fixtures: [],
      errors: [{ code: "EMPTY_WORKBOOK", message: "The workbook does not contain any worksheets." }],
      warnings
    };
  }

  const table = worksheet.table;

  const headerIndex = findHeaderRow(table);
  if (headerIndex === -1) {
    return {
      columns: [],
      fixtures: [],
      errors: [{ code: "HEADER_NOT_FOUND", message: "Could not find a Team Stats header row with Date, Match, Team and xG columns." }],
      warnings
    };
  }

  const headers = makeUniqueHeaders(table[headerIndex].map((value) => normalizeHeader(String(value ?? ""))));
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    errors.push({
      code: "MISSING_REQUIRED_COLUMNS",
      message: `Missing required Team Stats columns: ${missingColumns.join(", ")}`,
      details: missingColumns
    });
  }

  const matcher = createTeamMatcher(teams);
  const expectedNames = new Set([expectedHomeTeam.name, ...expectedHomeTeam.aliases].map(normalizeName));
  const dataRows = table
    .slice(headerIndex + 1)
    .map((row, index) => normalizeTeamStatsRow(headers, row, index + headerIndex + 2, warnings))
    .filter((row): row is NormalizedTeamStatsRow => row !== null);

  const fixtures: ParsedBaltikaFixture[] = [];
  const rowsByMatch = new Map<string, NormalizedTeamStatsRow[]>();
  for (const row of dataRows) {
    const key = `${row.dateKey}|${row.matchLabel}`;
    rowsByMatch.set(key, [...(rowsByMatch.get(key) ?? []), row]);
  }

  for (const rows of rowsByMatch.values()) {
    if (rows.length !== 2) {
      warnings.push({
        code: "INCOMPLETE_MATCH_PAIR",
        message: `Skipped ${rows[0]?.matchLabel ?? "match"}: expected 2 team rows, found ${rows.length}.`
      });
      continue;
    }

    const match = parseMatchLabel(rows[0].matchLabel);
    if (!match) {
      warnings.push({
        code: "MATCH_LABEL_NOT_PARSED",
        message: `Skipped ${rows[0].matchLabel}: could not parse home team, away team and score.`
      });
      continue;
    }

    if (!expectedNames.has(normalizeName(match.homeTeamName))) {
      errors.push({
        code: "HOME_TEAM_MISMATCH",
        message: `Expected ${expectedHomeTeam.name} home matches, but found ${match.homeTeamName} in "${rows[0].matchLabel}".`
      });
      continue;
    }

    const homeRow = rows.find((row) => namesEqual(row.teamName, match.homeTeamName));
    const awayRow = rows.find((row) => namesEqual(row.teamName, match.awayTeamName));
    if (!homeRow || !awayRow) {
      warnings.push({
        code: "MATCH_ROWS_NOT_ALIGNED",
        message: `Skipped ${rows[0].matchLabel}: team rows do not match the home/away names in the Match column.`
      });
      continue;
    }

    const homeTeam = matcher(match.homeTeamName);
    const awayTeam = matcher(match.awayTeamName);
    if (!awayTeam) {
      warnings.push({
        code: "AWAY_TEAM_NOT_MATCHED",
        message: `Saved ${match.awayTeamName} as text because it was not found in this league.`
      });
    }

    fixtures.push({
      kickoffAt: homeRow.date,
      matchLabel: homeRow.matchLabel,
      competition: homeRow.competition,
      durationMinutes: homeRow.durationMinutes,
      homeTeamId: homeTeam?.id ?? expectedHomeTeam.id,
      awayTeamId: awayTeam?.id ?? null,
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homeXg: homeRow.xg,
      awayXg: awayRow.xg,
      rows: [
        toParsedStatRow(homeRow, homeTeam?.id ?? expectedHomeTeam.id, awayTeam?.id ?? null, "HOME", awayRow.xg),
        toParsedStatRow(awayRow, awayTeam?.id ?? null, homeTeam?.id ?? expectedHomeTeam.id, "AWAY", homeRow.xg)
      ]
    });
  }

  return {
    columns: headers,
    fixtures: errors.some((error) => error.code === "MISSING_REQUIRED_COLUMNS" || error.code === "HOME_TEAM_MISMATCH")
      ? []
      : fixtures,
    errors,
    warnings
  };
}

type NormalizedTeamStatsRow = {
  sourceRowNumber: number;
  date: Date | null;
  dateKey: string;
  matchLabel: string;
  competition: string | null;
  durationMinutes: number | null;
  teamName: string;
  goals: number | null;
  xg: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  rawMetrics: Record<string, unknown>;
};

function findHeaderRow(table: unknown[][]) {
  const scanLimit = Math.min(table.length, 10);
  for (let index = 0; index < scanLimit; index += 1) {
    const headers = table[index].map((value) => normalizeHeader(String(value ?? "")));
    if (headers.includes("date") && headers.includes("match") && headers.includes("team") && headers.includes("xg")) {
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

function normalizeTeamStatsRow(
  headers: string[],
  row: unknown[],
  sourceRowNumber: number,
  warnings: ImportIssue[]
): NormalizedTeamStatsRow | null {
  const rawMetrics: Record<string, unknown> = {};

  headers.forEach((header, index) => {
    rawMetrics[header] = sanitizeCellValue(row[index]);
  });

  const teamName = stringValue(rawMetrics.team);
  const matchLabel = stringValue(rawMetrics.match);
  const date = parseDate(rawMetrics.date);

  if (!teamName && !matchLabel) return null;
  if (!teamName || !matchLabel) {
    warnings.push({
      code: "INCOMPLETE_TEAM_STATS_ROW",
      message: `Skipped row ${sourceRowNumber}: missing Team or Match value.`
    });
    return null;
  }

  return {
    sourceRowNumber,
    date,
    dateKey: date ? date.toISOString().slice(0, 10) : `row-${sourceRowNumber}`,
    matchLabel,
    competition: nullableString(rawMetrics.competition),
    durationMinutes: coerceInteger(rawMetrics.duration),
    teamName,
    goals: coerceInteger(rawMetrics.goals),
    xg: coerceNumber(rawMetrics.xg),
    shots: coerceInteger(rawMetrics.shots_on_target),
    shotsOnTarget: coerceInteger(rawMetrics.unnamed_10),
    rawMetrics: jsonSafe(rawMetrics)
  };
}

function parseMatchLabel(value: string) {
  const match = value.match(/^(.+?)\s+-\s+(.+?)\s+(\d+):(\d+)$/);
  if (!match) return null;

  return {
    homeTeamName: match[1].trim(),
    awayTeamName: match[2].trim(),
    homeScore: Number(match[3]),
    awayScore: Number(match[4])
  };
}

function toParsedStatRow(
  row: NormalizedTeamStatsRow,
  teamId: string | null,
  opponentTeamId: string | null,
  side: "HOME" | "AWAY",
  xga: number | null
): ParsedBaltikaTeamStatRow {
  return {
    teamId,
    opponentTeamId,
    teamName: row.teamName,
    side,
    goals: row.goals,
    xg: row.xg,
    xga,
    shots: row.shots,
    shotsOnTarget: row.shotsOnTarget
  };
}

function createTeamMatcher(teams: TeamMatcherInput[]) {
  const teamsByName = new Map<string, TeamMatcherInput>();
  for (const team of teams) {
    teamsByName.set(normalizeName(team.name), team);
    for (const alias of team.aliases) {
      teamsByName.set(normalizeName(alias), team);
    }
  }

  return (name: string) => teamsByName.get(normalizeName(name)) ?? null;
}

function namesEqual(left: string, right: string) {
  return normalizeName(left) === normalizeName(right);
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

function coerceNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function coerceInteger(value: unknown) {
  const numeric = coerceNumber(value);
  return numeric === null ? null : Math.round(numeric);
}

function parseDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    return parseExcelSerialDate(value);
  }

  const date = new Date(stringValue(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonSafe(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, entry instanceof Date ? entry.toISOString() : entry])
  );
}
