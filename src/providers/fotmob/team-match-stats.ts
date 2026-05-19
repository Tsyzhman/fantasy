type JsonRecord = Record<string, unknown>;

export type ParsedStatValue = number | string | null;

export type FotMobTeamMatchStats = {
  match_id: number | null;
  team_id: number;
  opponent_team_id: number;
  is_home: boolean;

  goals: number | null;
  xg: number | null;
  xgot: number | null;
  xa: number | null;

  shots: number | null;
  shots_on_target: number | null;
  shots_off_target: number | null;
  blocked_shots: number | null;
  big_chances: number | null;
  big_chances_missed: number | null;
  touches_in_opp_box: number | null;

  possession: number | null;
  passes: number | null;
  accurate_passes: number | null;
  pass_accuracy: number | null;

  corners: number | null;
  offsides: number | null;
  fouls: number | null;
  yellow_cards: number | null;
  red_cards: number | null;

  tackles_won: number | null;
  interceptions: number | null;
  clearances: number | null;
  saves: number | null;

  raw_stats: Record<string, unknown>;
  raw_shots: unknown[];
};

type NumericStatField =
  | "goals"
  | "xg"
  | "xgot"
  | "xa"
  | "shots"
  | "shots_on_target"
  | "shots_off_target"
  | "blocked_shots"
  | "big_chances"
  | "big_chances_missed"
  | "touches_in_opp_box"
  | "possession"
  | "passes"
  | "accurate_passes"
  | "pass_accuracy"
  | "corners"
  | "offsides"
  | "fouls"
  | "yellow_cards"
  | "red_cards"
  | "tackles_won"
  | "interceptions"
  | "clearances"
  | "saves";

type TeamInfo = {
  id: number;
  raw: JsonRecord;
};

type StatRow = {
  label: string;
  homeValue: unknown;
  awayValue: unknown;
};

type ShotAggregate = {
  shots: number;
  xg: number | null;
  xgot: number | null;
  shots_on_target: number;
  goals: number;
  blocked_shots: number;
  raw_shots: unknown[];
};

const normalizedStatNames: Record<string, NumericStatField> = {
  "expected goals": "xg",
  "expected goals xg": "xg",
  xg: "xg",
  "expected goals on target": "xgot",
  "expected goals on target xgot": "xgot",
  xgot: "xgot",
  "expected assists": "xa",
  "expected assists xa": "xa",
  xa: "xa",
  goals: "goals",
  "ball possession": "possession",
  possession: "possession",
  "total shots": "shots",
  shots: "shots",
  "shots on target": "shots_on_target",
  "shots off target": "shots_off_target",
  "blocked shots": "blocked_shots",
  "big chances": "big_chances",
  "big chances missed": "big_chances_missed",
  "touches in opposition box": "touches_in_opp_box",
  "touches in opp box": "touches_in_opp_box",
  corners: "corners",
  offsides: "offsides",
  "fouls committed": "fouls",
  fouls: "fouls",
  "yellow cards": "yellow_cards",
  "red cards": "red_cards",
  saves: "saves",
  "keeper saves": "saves",
  "tackles won": "tackles_won",
  interceptions: "interceptions",
  clearances: "clearances",
  passes: "passes",
  "accurate passes": "accurate_passes",
  "pass accuracy": "pass_accuracy"
};

export function parse_stat_value(value: unknown): ParsedStatValue {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^-?\d+(?:[.,]\d+)?\s*%$/.test(trimmed)) {
      return parseFloat(trimmed.replace("%", "").replace(",", "."));
    }
    if (/^-?\d+(?:[.,]\d+)?\s*\/\s*-?\d+(?:[.,]\d+)?$/.test(trimmed)) return trimmed;
    if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
    if (/^-?\d+[.,]\d+$/.test(trimmed)) return Number.parseFloat(trimmed.replace(",", "."));
    return trimmed;
  }
  return unwrapStatValue(value);
}

export function extract_team_match_stats(payload: unknown): FotMobTeamMatchStats[] {
  const root = asRecord(payload);
  const teams = extractTeams(root);
  if (!teams.home || !teams.away) return [];

  const matchId = firstNumber(
    root.match_id,
    root.matchId,
    root.id,
    asRecord(root.general).match_id,
    asRecord(root.general).matchId,
    asRecord(root.general).id,
    asRecord(root.header).match_id,
    asRecord(root.header).matchId,
    asRecord(root.header).id
  );

  const homeRow = createEmptyRow(matchId, teams.home, teams.away, true);
  const awayRow = createEmptyRow(matchId, teams.away, teams.home, false);
  homeRow.goals = readScore(teams.home.raw);
  awayRow.goals = readScore(teams.away.raw);

  applyReadyMadeStats(root, homeRow, awayRow);

  const shotAggregates = aggregateShots(root);
  applyShotFallback(homeRow, shotAggregates.get(homeRow.team_id));
  applyShotFallback(awayRow, shotAggregates.get(awayRow.team_id));

  const xaByTeam = aggregatePlayerXa(root, new Set([homeRow.team_id, awayRow.team_id]));
  if (homeRow.xa == null) homeRow.xa = roundNullable(xaByTeam.get(homeRow.team_id));
  if (awayRow.xa == null) awayRow.xa = roundNullable(xaByTeam.get(awayRow.team_id));

  return [homeRow, awayRow];
}

export const extractTeamMatchStats = extract_team_match_stats;

function createEmptyRow(matchId: number | null, team: TeamInfo, opponent: TeamInfo, isHome: boolean): FotMobTeamMatchStats {
  return {
    match_id: matchId,
    team_id: team.id,
    opponent_team_id: opponent.id,
    is_home: isHome,
    goals: null,
    xg: null,
    xgot: null,
    xa: null,
    shots: null,
    shots_on_target: null,
    shots_off_target: null,
    blocked_shots: null,
    big_chances: null,
    big_chances_missed: null,
    touches_in_opp_box: null,
    possession: null,
    passes: null,
    accurate_passes: null,
    pass_accuracy: null,
    corners: null,
    offsides: null,
    fouls: null,
    yellow_cards: null,
    red_cards: null,
    tackles_won: null,
    interceptions: null,
    clearances: null,
    saves: null,
    raw_stats: {},
    raw_shots: []
  };
}

function extractTeams(root: JsonRecord): { home: TeamInfo | null; away: TeamInfo | null } {
  const general = asRecord(root.general);
  const header = asRecord(root.header);
  const headerTeams = header.teams;

  let home =
    teamInfo(general.homeTeam) ??
    teamInfo(root.homeTeam) ??
    teamInfo(root.home) ??
    teamInfo(header.homeTeam) ??
    teamInfo(header.home);
  let away =
    teamInfo(general.awayTeam) ??
    teamInfo(root.awayTeam) ??
    teamInfo(root.away) ??
    teamInfo(header.awayTeam) ??
    teamInfo(header.away);

  if ((!home || !away) && Array.isArray(headerTeams)) {
    home ??= teamInfo(headerTeams[0]);
    away ??= teamInfo(headerTeams[1]);
  }

  if ((!home || !away) && isRecord(headerTeams)) {
    home ??= teamInfo(headerTeams.homeTeam) ?? teamInfo(headerTeams.home);
    away ??= teamInfo(headerTeams.awayTeam) ?? teamInfo(headerTeams.away);
  }

  return { home, away };
}

function teamInfo(value: unknown): TeamInfo | null {
  const record = asRecord(value);
  const id = teamId(record);
  if (id == null) return null;
  return { id, raw: record };
}

function teamId(record: JsonRecord): number | null {
  return firstNumber(record.teamId, record.team_id, record.teamID, record.id, asRecord(record.team).id, asRecord(record.team).teamId);
}

function explicitTeamId(record: JsonRecord): number | null {
  return firstNumber(record.teamId, record.team_id, record.teamID, asRecord(record.team).id, asRecord(record.team).teamId);
}

function readScore(team: JsonRecord): number | null {
  return firstNumber(team.score, team.goals, team.teamScore, asRecord(team.scoreDetails).score);
}

function applyReadyMadeStats(root: JsonRecord, homeRow: FotMobTeamMatchStats, awayRow: FotMobTeamMatchStats) {
  const statsRoot = asRecord(asRecord(asRecord(asRecord(root.content).stats).Periods).All).stats;
  for (const stat of collectStatRows(statsRoot)) {
    const homeRaw = unwrapRawValue(stat.homeValue);
    const awayRaw = unwrapRawValue(stat.awayValue);
    homeRow.raw_stats[stat.label] = homeRaw;
    awayRow.raw_stats[stat.label] = awayRaw;

    const field = statField(stat.label);
    if (!field) continue;

    assignNumeric(homeRow, field, parse_stat_value(homeRaw));
    assignNumeric(awayRow, field, parse_stat_value(awayRaw));
  }
}

function collectStatRows(value: unknown): StatRow[] {
  const rows: StatRow[] = [];
  collectStatRowsInto(value, rows);
  return rows;
}

function collectStatRowsInto(value: unknown, rows: StatRow[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectStatRowsInto(item, rows);
    return;
  }
  if (!isRecord(value)) return;

  const label = statLabel(value);
  const teamValues = extractTeamValues(value);
  if (label && teamValues) {
    rows.push({ label, homeValue: teamValues.home, awayValue: teamValues.away });
  }

  for (const key of ["stats", "groups", "items", "children", "sections"]) {
    collectStatRowsInto(value[key], rows);
  }
}

function extractTeamValues(record: JsonRecord): { home: unknown; away: unknown } | null {
  const directHome = firstDefined(record.home, record.homeValue, record.homeStat, record.homeTeamValue);
  const directAway = firstDefined(record.away, record.awayValue, record.awayStat, record.awayTeamValue);
  if (directHome !== undefined && directAway !== undefined) return { home: directHome, away: directAway };

  const values = record.stats ?? record.values;
  if (Array.isArray(values) && values.length >= 2 && isTeamValue(values[0]) && isTeamValue(values[1])) {
    return { home: values[0], away: values[1] };
  }

  return null;
}

function isTeamValue(value: unknown): boolean {
  if (!isRecord(value)) return true;
  if (Array.isArray(value.stats) || Array.isArray(value.children) || Array.isArray(value.items)) return false;
  return ["value", "stat", "displayValue", "valueString", "text", "total"].some((key) => value[key] !== undefined);
}

function statLabel(record: JsonRecord): string | null {
  for (const key of ["title", "name", "label", "key", "displayName"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function statField(label: string): NumericStatField | null {
  return normalizedStatNames[normalizeLabel(label)] ?? null;
}

function normalizeLabel(label: string) {
  return label
    .toLowerCase()
    .replace(/\([^)]*\)/g, (match) => ` ${match.slice(1, -1)} `)
    .replace(/[._-]/g, " ")
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrapRawValue(value: unknown): unknown {
  if (!isRecord(value)) return value;
  for (const key of ["value", "stat", "displayValue", "valueString", "text", "total"]) {
    if (value[key] !== undefined) return value[key];
  }
  return value;
}

function unwrapStatValue(value: unknown): ParsedStatValue {
  const raw = unwrapRawValue(value);
  if (raw === value) return typeof value === "boolean" ? Number(value) : String(value);
  return parse_stat_value(raw);
}

function assignNumeric(row: FotMobTeamMatchStats, field: NumericStatField, value: ParsedStatValue) {
  if (typeof value === "number" && Number.isFinite(value)) {
    row[field] = value;
  }
}

function aggregateShots(root: JsonRecord): Map<number, ShotAggregate> {
  const shots = asRecord(asRecord(root.content).shotmap).shots;
  const aggregates = new Map<number, ShotAggregate>();
  if (!Array.isArray(shots)) return aggregates;

  for (const shot of shots) {
    const record = asRecord(shot);
    const id = teamId(record);
    if (id == null) continue;

    const aggregate = aggregates.get(id) ?? {
      shots: 0,
      xg: null,
      xgot: null,
      shots_on_target: 0,
      goals: 0,
      blocked_shots: 0,
      raw_shots: []
    };
    aggregate.shots += 1;
    aggregate.raw_shots.push(shot);

    const xg = firstNumber(record.expectedGoals, record.expected_goals, record.xg, record.expectedGoalsValue);
    if (xg != null) aggregate.xg = (aggregate.xg ?? 0) + xg;

    const xgot = firstNumber(record.expectedGoalsOnTarget, record.expected_goals_on_target, record.xgot, record.expectedGoalsOnTargetValue);
    if (xgot != null) aggregate.xgot = (aggregate.xgot ?? 0) + xgot;

    const eventType = String(firstDefined(record.eventType, record.event_type, record.type, "")).toLowerCase();
    if (record.isOnTarget === true || eventType.includes("goal") || eventType.includes("saved") || eventType.includes("on target") || eventType.includes("sot")) {
      aggregate.shots_on_target += 1;
    }
    if (eventType.includes("goal")) aggregate.goals += 1;
    if (record.isBlocked === true || eventType.includes("block")) aggregate.blocked_shots += 1;

    aggregates.set(id, aggregate);
  }

  return aggregates;
}

function applyShotFallback(row: FotMobTeamMatchStats, aggregate: ShotAggregate | undefined) {
  if (!aggregate) return;

  row.raw_shots = aggregate.raw_shots;
  if (row.shots == null) row.shots = aggregate.shots;
  if (row.xg == null) row.xg = roundNullable(aggregate.xg);
  if (row.xgot == null) row.xgot = roundNullable(aggregate.xgot);
  if (row.shots_on_target == null) row.shots_on_target = aggregate.shots_on_target;
  if (row.goals == null) row.goals = aggregate.goals;
  if (row.blocked_shots == null) row.blocked_shots = aggregate.blocked_shots;
}

function aggregatePlayerXa(root: JsonRecord, teamIds: Set<number>): Map<number, number> {
  const totals = new Map<number, number>();
  const visited = new Set<object>();

  const visit = (value: unknown, contextTeamId: number | null) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, contextTeamId);
      return;
    }
    if (!isRecord(value) || visited.has(value)) return;
    visited.add(value);

    const currentTeamId = explicitTeamId(value) ?? (Array.isArray(value.players) ? firstNumber(value.id) : null) ?? contextTeamId;
    const xa = readXaValue(value);
    if (currentTeamId != null && teamIds.has(currentTeamId) && xa != null) {
      totals.set(currentTeamId, (totals.get(currentTeamId) ?? 0) + xa);
    }

    for (const child of Object.values(value)) {
      visit(child, currentTeamId);
    }
  };

  visit(root, null);
  return totals;
}

function readXaValue(record: JsonRecord): number | null {
  const direct = firstNumber(record.xA, record.xa, record.expectedAssists, record.expected_assists);
  if (direct != null) return direct;

  if (Array.isArray(record.stats)) {
    for (const item of record.stats) {
      const stat = asRecord(item);
      const label = statLabel(stat);
      if (label && statField(label) === "xa") {
        const value = parse_stat_value(unwrapRawValue(stat.value ?? stat.stat ?? stat.displayValue));
        if (typeof value === "number") return value;
      }
    }
  }

  return null;
}

function roundNullable(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined);
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parse_stat_value(value);
    if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
