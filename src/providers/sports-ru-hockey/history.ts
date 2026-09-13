/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import { parse } from "node-html-parser";
import { parseToi, type KhlPosition } from "@/khl/contracts";

export type HockeyHistoryRow = { date: string; opponent: string; opponentSlug: string; home: boolean; matchUrl: string; score: string | null; week: number | null; toiSeconds: number | null; goals: number | null; assists: number | null; plusMinus: number | null; pimMinutes: number | null; saves: number | null; goalsAgainst: number | null; points: number | null };
export type HockeyHistory = { tagId: string | null; name: string; club: string; clubSlug: string; season: string; position: KhlPosition; rows: HockeyHistoryRow[]; fixtures: HockeyHistoryRow[] };
const text = (value: string) => value.replace(/\s+/g, " ").trim();
function number(value: string) { const s = text(value); if (!s || s === "—" || s === "-") return null; if (!/^-?\d+$/.test(s)) throw new Error("HISTORY_NUMBER_INVALID"); return Number(s); }
function slug(url: string) { const match = /^https:\/\/www\.sports\.ru\/hockey\/club\/([\w-]+)\/$/.exec(url); if (!match) throw new Error("HISTORY_CLUB_INVALID"); return match[1]; }
export function parseHockeyHistory(html: string, expected: { tagId: string; season: string; position: KhlPosition; historyOnly?: boolean }): HockeyHistory {
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error("HISTORY_SIZE_INVALID");
  const root = parse(html), link = root.querySelector(".go-to-page")?.getAttribute("href") ?? "";
  const tagId = /\/tags\/(\d+)\//.exec(link)?.[1] ?? null;
  const season = root.querySelector("#slt option[selected]")?.text.trim();
  const profile = root.querySelectorAll(".profile-table tr");
  const clubLink = profile[0]?.querySelector("a"), club = clubLink?.text.trim();
  const position = ({ "Вратарь": "G", "Защитник": "D", "Нападающий": "F" } as const)[profile[1]?.querySelector("td")?.text.trim() as "Вратарь"];
  const name = root.querySelector("h1")?.text.trim();
  if (tagId ? tagId !== expected.tagId : !/^https:\/\/www\.sports\.ru\/(?:hockey\/person\/)?[\w-]+\/$/.test(link)) throw new Error("HISTORY_IDENTITY_INVALID");
  if (season && season !== expected.season || position !== expected.position || !name || !club) throw new Error("HISTORY_IDENTITY_INVALID");
  // The provider omits </tbody> in its history table. Isolate the two complete
  // table fragments so the forgiving parser cannot swallow the calendar.
  const historyStart = html.indexOf('<div id="stat">'), calendarStart = html.indexOf('<div id="calendar">');
  if (historyStart < 0 || calendarStart <= historyStart) throw new Error("HISTORY_SCHEMA_INVALID");
  const tables = [html.slice(historyStart, calendarStart), html.slice(calendarStart)].map(section => {
    const fragment = /<table\b[^>]*class="stat-table"[^>]*>[\s\S]*?<\/table>/.exec(section)?.[0];
    return fragment ? parse(fragment, { parseNoneClosedTags: true }).querySelector("table") : null;
  });
  if (!tables[1]) throw new Error("HISTORY_SCHEMA_INVALID");
  const parsed = tables.map((table, tableIndex) => {
    // Sports retains the current calendar when an archived statistics season is selected.
    if (tableIndex === 1 && expected.historyOnly) return [];
    if (!table) return [];
    const columns = table!.querySelectorAll("thead td").map(c => text(c.text));
    const expectedColumns = tableIndex ? ["Дата", "Соперник", "", "Счет"] : position === "G" ? ["Дата", "Соперник", "", "Счет", "МИН", "Сэйв", "ПР", "О", "С"] : ["Дата", "Соперник", "", "Счет", "МИН", "Г", "П", "+/-", "ШВ", "СМ", "О", "С"];
    if (JSON.stringify(columns) !== JSON.stringify(expectedColumns)) throw new Error("HISTORY_COLUMNS_INVALID");
    const rows = table!.querySelectorAll("tbody tr");
    if (rows.length > 100) throw new Error("HISTORY_ROW_LIMIT");
    return rows.map(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length !== columns.length) throw new Error("HISTORY_ROW_INVALID");
      const values = cells.map(c => text(c.text)), rawDate = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(values[0]);
      if (!rawDate || !["Дома", "В гостях"].includes(values[2])) throw new Error("HISTORY_DATE_OR_VENUE_INVALID");
      const date = `${rawDate[3]}-${rawDate[2]}-${rawDate[1]}`;
      if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("HISTORY_DATE_INVALID");
      const [firstYear, lastYear] = expected.season.split("/");
      if (date < `${firstYear}-07-01` || date >= `${lastYear}-07-01`) throw new Error("HISTORY_SEASON_INVALID");
      const cell = (key: string) => columns.includes(key) ? number(values[columns.indexOf(key)]) : null;
      const rawToi = columns.includes("МИН") ? values[columns.indexOf("МИН")] : "";
      const toiSeconds = parseToi(rawToi);
      if (rawToi && rawToi !== "—" && rawToi !== "-" && toiSeconds === null) throw new Error("HISTORY_TOI_INVALID");
      const opponentLink = cells[1].querySelector("a"), matchUrl = cells[3].querySelector("a")?.getAttribute("href") ?? "";
      if (!/^https:\/\/www\.sports\.ru\/hockey\/match\/[\w-]+\/$/.test(matchUrl)) throw new Error("HISTORY_MATCH_INVALID");
      const week = /неделя\s+(\d+)/.exec(values[0]);
      return { date, opponent: opponentLink?.text.trim() ?? "", opponentSlug: slug(opponentLink?.getAttribute("href") ?? ""), home: values[2] === "Дома", matchUrl, score: /^\d+\s*:\s*\d+$/.test(values[3]) ? values[3].replace(/\s/g, "") : null, week: week ? Number(week[1]) : null, toiSeconds, goals: cell("Г"), assists: cell("П"), plusMinus: cell("+/-"), pimMinutes: cell("ШВ"), saves: cell("Сэйв"), goalsAgainst: cell("ПР"), points: cell("О") };
    });
  });
  if (new Set(parsed[0].map(r => `${r.date}:${r.opponentSlug}:${r.home}`)).size !== parsed[0].length) throw new Error("HISTORY_DUPLICATE");
  return { tagId, name, season: expected.season, club, clubSlug: slug(clubLink!.getAttribute("href")!), position, rows: parsed[0], fixtures: parsed[1] };
}

export function previousHockeySeason(season: string) {
  const match = /^(\d{4})\/(\d{4})$/.exec(season);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) throw new Error("HISTORY_SEASON_INVALID");
  return `${Number(match[1]) - 1}/${match[1]}`;
}
export function hockeyHistorySeasonId(html: string, season: string) {
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error("HISTORY_SIZE_INVALID");
  const options = parse(html).querySelectorAll("#slt option").filter(o => text(o.text) === season);
  if (options.length > 1) throw new Error("HISTORY_SEASON_DUPLICATE");
  const id = options[0]?.getAttribute("value");
  if (id !== undefined && !/^\d{1,12}$/.test(id)) throw new Error("HISTORY_SEASON_INVALID");
  return id ?? null;
}
export async function fetchHockeyHistory(contest: string, player: string, signal?: AbortSignal, seasonId?: string) {
  if (!/^\d+$/.test(contest) || !/^\d+$/.test(player)) throw new Error("HISTORY_REQUEST_INVALID");
  if (seasonId !== undefined && !/^\d{1,12}$/.test(seasonId)) throw new Error("HISTORY_SEASON_INVALID");
  const url = `https://www.sports.ru/fantasy/hockey/player/info/${contest}/${player}.html${seasonId ? `?s=${seasonId}` : ""}`;
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]) });
  if (!response.ok) throw new Error(`SPORTS_RU_HTTP_${response.status}`);
  if (!response.body) throw new Error("HISTORY_EMPTY_RESPONSE");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("HISTORY_SIZE_INVALID"); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return { url, html: Buffer.concat(chunks).toString("utf8") };
}
