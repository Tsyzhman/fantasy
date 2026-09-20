/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#protocols */
import { parse } from "node-html-parser";
import { parseToi, type KhlPosition } from "@/khl/contracts";

export interface KhlProtocolRow {
  officialPlayerId: string; name: string; teamName: string; position: KhlPosition;
  birthDate?: string;
  participationStatus: "PLAYED" | "DNP";
  toiSeconds: number | null; ppToiSeconds: number | null; pkToiSeconds: number | null;
  attackZoneSeconds: number | null; goals: number | null; assists: number | null;
  plusMinus: number | null; pimMinutes: number | null; shotsOnGoal: number | null;
  saves: number | null; goalsAgainst: number | null; shifts: number | null; blockedShots: number | null;
}
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const integer = (s: string) => {
  if (!s || ["-", "—"].includes(s)) return null;
  if (!/^-?\d+(?:\.0+)?$/.test(s) || !Number.isSafeInteger(Number(s))) throw new Error("PROTOCOL_NUMBER_INVALID");
  return Number(s);
};
const seconds = (s: string) => {
  if (!s || ["-", "—"].includes(s)) return null;
  if (s === "0") return 0;
  const value = parseToi(s);
  if (value === null) throw new Error("PROTOCOL_TIME_INVALID");
  return value;
};

export function parseKhlProtocol(html: string, officialMatchId: string, officialSeasonId?: string) {
  if (Buffer.byteLength(html) > 5 * 1024 * 1024 || !/^\d+$/.test(officialMatchId)) throw new Error("PROTOCOL_SCOPE_INVALID");
  if (html.trimStart().startsWith("{")) return parseRestProtocol(html, officialMatchId, officialSeasonId);
  const root = parse(html);
  if (!root.querySelector(`a[href*="game-${officialMatchId}-ru.pdf"]`)) throw new Error("PROTOCOL_MATCH_INVALID");
  const rows: KhlProtocolRow[] = [];
  const ids = new Set<string>();
  const tables = new Set<string>();
  for (const fragment of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const table = parse(fragment[0]).querySelector("table")!;
    const columns = table.querySelectorAll("thead th").map(th => th.querySelector("[data-name]")?.getAttribute("data-name") ?? clean(th.text));
    if (!columns.includes("gp") || !columns.includes("toi") || !table.querySelector('a[href*="/players/"]')) continue;
    const prefix = html.slice(0, fragment.index);
    const teamNames = [...prefix.matchAll(/<span\b[^>]*class="team-badge__name"[^>]*>([^<]+)<\/span>/g)];
    const labels = [...prefix.matchAll(/<p\b[^>]*class="table__head-title"[^>]*>([^<]+)<\/p>/g)];
    const teamName = clean(teamNames.at(-1)?.[1] ?? "");
    const label = clean(labels.at(-1)?.[1] ?? "");
    const position = ({ "Вратари": "G", "Защитники": "D", "Нападающие": "F" } as const)[label as "Вратари"];
    if (!teamName || !position || new Set(columns).size !== columns.length) throw new Error("PROTOCOL_TABLE_INVALID");
    const required = position === "G" ? ["gp", "toi", "sv", "ga"] : ["gp", "toi", "tipp_avg", "tish_avg", "toa_avg", "g", "a", "sog", "pim", "pm"];
    if (required.some(key => !columns.includes(key))) throw new Error("PROTOCOL_COLUMNS_INVALID");
    if (tables.has(`${teamName}:${position}`)) throw new Error("PROTOCOL_TABLE_DUPLICATE");
    tables.add(`${teamName}:${position}`);
    for (const tr of table.querySelectorAll("tbody tr")) {
      const link = tr.querySelector('a[href*="/players/"]');
      if (!link) continue;
      const officialPlayerId = /\/players\/(\d+)\//.exec(link.getAttribute("href") ?? "")?.[1];
      const cells = tr.querySelectorAll("td").map(td => clean(td.text));
      if (!officialPlayerId || ids.has(officialPlayerId) || cells.length !== columns.length) throw new Error("PROTOCOL_PLAYER_INVALID");
      ids.add(officialPlayerId);
      const value = (key: string) => cells[columns.indexOf(key)] ?? "";
      const number = (key: string) => integer(value(key));
      const time = (key: string) => seconds(value(key));
      const games = number("gp");
      if (games !== 0 && games !== 1) throw new Error("PROTOCOL_NOT_SINGLE_MATCH");
      rows.push({ officialPlayerId, name: clean(link.text), teamName, position,
        participationStatus: games ? "PLAYED" : "DNP", toiSeconds: time("toi"), ppToiSeconds: time("tipp_avg"), pkToiSeconds: time("tish_avg"), attackZoneSeconds: time("toa_avg"),
        goals: number("g"), assists: number("a"), plusMinus: number("pm"), pimMinutes: number("pim"), shotsOnGoal: position === "G" ? null : number("sog"),
        saves: number("sv"), goalsAgainst: number("ga"), shifts: number("sft_avg"), blockedShots: number("bls") });
    }
  }
  if (tables.size !== 6 || rows.length < 30 || rows.length > 60 || new Set(rows.map(r => r.teamName)).size !== 2) throw new Error("PROTOCOL_COVERAGE_INVALID");
  // A whole column of zeroes is a telemetry placeholder, not 40 genuine zero-attack games.
  const attackTimeAvailable = rows.some(r => (r.attackZoneSeconds ?? 0) > 0);
  if (!attackTimeAvailable) for (const row of rows) row.attackZoneSeconds = null;
  return { officialMatchId, rows, attackTimeAvailable };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROTOCOL_RESPONSE_INVALID");
  return value as Record<string, unknown>;
}

/** The same public JSON used by khl.ru to render all six protocol tables. */
function parseRestProtocol(raw: string, officialMatchId: string, officialSeasonId?: string) {
  const response = object(JSON.parse(raw));
  if (response.status !== "success") throw new Error("PROTOCOL_RESPONSE_INVALID");
  const data = object(response.data), pdf = object(object(data.pdf).stat);
  const identity = /^\/pdf\/(\d+)\/(\d+)\/game-(\d+)-ru\.pdf$/.exec(String(pdf.URL));
  if (!identity || identity[2] !== officialMatchId || identity[3] !== officialMatchId || officialSeasonId && identity[1] !== officialSeasonId) throw new Error("PROTOCOL_MATCH_INVALID");
  const teams = object(data.teams), rows: KhlProtocolRow[] = [], ids = new Set<string>();
  for (const side of ["home", "visitor"]) {
    const team = object(teams[side]), stats = object(team.stats);
    if (typeof team.name !== "string" || !team.name.trim()) throw new Error("PROTOCOL_TABLE_INVALID");
    for (const [group, position] of [["gk", "G"], ["def", "D"], ["fwd", "F"]] as const) {
      const entries = stats[group];
      if (!Array.isArray(entries) || !entries.length) throw new Error("PROTOCOL_COVERAGE_INVALID");
      for (const entry of entries) {
        const p = object(entry);
        const required = position === "G" ? ["gp", "toi", "sv", "ga", "g", "a", "pim"] : ["gp", "toi_avg", "tipp_avg", "tish_avg", "toa_avg", "g", "a", "sog", "pim", "pm", "sft_avg", "bls"];
        if (required.some(key => !(key in p))) throw new Error("PROTOCOL_COLUMNS_INVALID");
        if (typeof p.id !== "string" || !/^\d+$/.test(p.id) || ids.has(p.id) || typeof p.name !== "string" || !p.name.trim() || p.teamname !== team.name) throw new Error("PROTOCOL_PLAYER_INVALID");
        ids.add(p.id);
        const value = (key: string) => {
          const v = p[key];
          if (v === undefined || v === null) return "";
          if (typeof v !== "string" && typeof v !== "number") throw new Error("PROTOCOL_NUMBER_INVALID");
          return String(v);
        };
        const number = (key: string) => integer(value(key)), time = (key: string) => seconds(value(key));
        const games = number("gp");
        if (games !== 0 && games !== 1) throw new Error("PROTOCOL_NOT_SINGLE_MATCH");
        let birthDate: string | undefined;
        if (p.birthdate !== undefined) {
          if (typeof p.birthdate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthdate) || !Number.isFinite(Date.parse(p.birthdate)) || new Date(p.birthdate).toISOString().slice(0, 10) !== p.birthdate) throw new Error('PROTOCOL_BIRTHDATE_INVALID');
          birthDate = p.birthdate;
        }
        rows.push({ officialPlayerId: p.id, name: clean(p.name), teamName: clean(team.name), position,
          ...(birthDate ? { birthDate } : {}),
          participationStatus: games ? "PLAYED" : "DNP", toiSeconds: time(position === "G" ? "toi" : "toi_avg"),
          ppToiSeconds: time("tipp_avg"), pkToiSeconds: time("tish_avg"), attackZoneSeconds: time("toa_avg"),
          goals: number("g"), assists: number("a"), plusMinus: number("pm"), pimMinutes: number("pim"),
          shotsOnGoal: position === "G" ? null : number("sog"), saves: number("sv"), goalsAgainst: number("ga"), shifts: number("sft_avg"), blockedShots: number("bls") });
      }
    }
  }
  if (rows.length < 30 || rows.length > 60 || new Set(rows.map(r => r.teamName)).size !== 2) throw new Error("PROTOCOL_COVERAGE_INVALID");
  const attackTimeAvailable = rows.some(r => (r.attackZoneSeconds ?? 0) > 0);
  if (!attackTimeAvailable) for (const row of rows) row.attackZoneSeconds = null;
  return { officialMatchId, rows, attackTimeAvailable };
}
