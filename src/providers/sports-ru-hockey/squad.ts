/** @spec spec://modules/khl/FEAT-002-khl-squad#sports-import */
import { parse } from "node-html-parser";
import type { KhlPosition } from "@/khl/contracts";

const origin = "https://www.sports.ru";
const numericId = (value: unknown) => typeof value === "string" && /^\d{1,20}$/.test(value);
const integer = (value: unknown): number | null => (typeof value === "number" || typeof value === "string" && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export type SportsHockeySquad = { teamId: string; name: string; week: string; bank: number; totalPrice: number; players: { id: string; position: KhlPosition; price: number }[]; source: string };

export function hockeyTeamForProfile(html: string, contestId: string) {
  const root = parse(html);
  const teams = root.querySelectorAll(".league").flatMap(block => {
    if (!block.querySelector(`a[href="/fantasy/hockey/tournament/${contestId}.html"]`)) return [];
    return block.querySelectorAll("a").flatMap(a => /^\/fantasy\/hockey\/team\/(\d+)\.html$/.exec(a.getAttribute("href") ?? "")?.[1] ?? []);
  });
  if (new Set(teams).size !== 1) throw new Error(teams.length ? "На Sports найдено несколько команд этого турнира" : "В привязанном профиле Sports нет команды этого турнира КХЛ");
  return teams[0];
}

export function parseSportsHockeySquad(html: string, payload: unknown, expected: { profileId: string; contestId: string; teamId: string }): SportsHockeySquad {
  const root = parse(html);
  const rows = new Map(root.querySelectorAll(".profile-table tr").map(row => [row.querySelector("th")?.text.trim(), row.querySelector("td")]));
  const owner = rows.get("Пользователь")?.querySelector("a.nickname")?.getAttribute("href")?.replace(/\/$/, "");
  const contest = rows.get("Турнир")?.querySelector("a")?.getAttribute("href");
  const team = /\.set\(['"]team_id['"],\s*(\d+)\)/.exec(html)?.[1];
  if (owner !== `/profile/${expected.profileId}` || contest !== `/fantasy/hockey/tournament/${expected.contestId}.html` || team !== expected.teamId) throw new Error("Sports вернул другую команду или другой турнир");
  const bank = integer(rows.get("Баланс")?.text.replace(/[\s\u00a0]/g, ""));
  const totalPrice = integer(rows.get("Стоимость команды")?.text.replace(/[\s\u00a0]/g, ""));
  if (bank === null || totalPrice === null || bank > 2147483647) throw new Error("Sports не опубликовал проверяемый банк команды");
  const raw = payload && typeof payload === "object" && "players" in payload ? payload.players : null;
  if (!Array.isArray(raw) || raw.length !== 17) throw new Error("Sports пока не опубликовал полный состав из 17 игроков");
  const players = raw.map(p => {
    if (!p || typeof p !== "object" || !numericId(String(p.id ?? "")) || String(p.now_id) !== expected.contestId || !["1", "2", "3"].includes(String(p.amplua))) throw new Error("Неверный игрок в составе Sports");
    const price = integer(p.price);
    if (price === null) throw new Error("Sports не опубликовал цену игрока");
    return { id: String(p.id), position: ({ "1": "G", "2": "D", "3": "F" } as const)[String(p.amplua) as "1" | "2" | "3"], price };
  });
  if (new Set(players.map(p => p.id)).size !== 17 || players.filter(p => p.position === "G").length !== 2 || players.filter(p => p.position === "D").length !== 6 || players.filter(p => p.position === "F").length !== 9) throw new Error("Состав Sports не соответствует 2 вратарям, 6 защитникам и 9 нападающим");
  if (players.reduce((sum, p) => sum + p.price, 0) !== totalPrice) throw new Error("Состав Sports изменился во время загрузки. Повторите импорт");
  return { teamId: expected.teamId, name: root.querySelector("h1")?.text.trim().slice(0, 100) || "Команда Sports", week: /\b(\d+)\b/.exec(rows.get("Текущая неделя")?.text ?? "")?.[1] ?? "unknown", bank, totalPrice, players, source: `${origin}/fantasy/hockey/team/${expected.teamId}.html` };
}

async function readSports(path: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${origin}${path}`, { redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw new Error(`Sports недоступен (HTTP ${response.status})`);
  if (!response.body) throw new Error("Sports вернул пустой ответ");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("Ответ Sports превышает 2 МБ"); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchSportsHockeySquad(profileId: string, contestId: string, fetchImpl: typeof fetch = fetch) {
  if (!numericId(profileId) || !numericId(contestId)) throw new Error("Неверная привязка Sports");
  const teamId = hockeyTeamForProfile(await readSports(`/profile/${profileId}/fantasy/`, fetchImpl), contestId);
  const html = await readSports(`/fantasy/hockey/team/${teamId}.html`, fetchImpl);
  const payload = JSON.parse(await readSports(`/fantasy/hockey/team/json/${teamId}.json`, fetchImpl));
  return parseSportsHockeySquad(html, payload, { profileId, contestId, teamId });
}
