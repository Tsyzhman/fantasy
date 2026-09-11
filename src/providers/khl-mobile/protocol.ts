/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#protocols */
import { parse } from "node-html-parser";
import { parseToi, type KhlPosition } from "@/khl/contracts";

export interface KhlProtocolRow {
  officialPlayerId: string; name: string; teamName: string; position: KhlPosition;
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

export function parseKhlProtocol(html: string, officialMatchId: string) {
  if (Buffer.byteLength(html) > 5 * 1024 * 1024 || !/^\d+$/.test(officialMatchId)) throw new Error("PROTOCOL_SCOPE_INVALID");
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
