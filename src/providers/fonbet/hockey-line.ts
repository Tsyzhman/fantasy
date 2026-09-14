/** @spec spec://modules/khl/INFRA-003-khl-fonbet-odds#markets
 * @spec spec://modules/khl/INFRA-003-khl-fonbet-odds#matching */
import { FONBET_PUBLIC_LINE_BASE_URL } from './odds';
import { type HockeyMarket } from './hockey-markets';
export const KHL_LINE_VERSION = 'fonbet-khl-1x2-60-v1';
type Json = Record<string, unknown>;
const record = (v: unknown): Json => v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
const list = (v: unknown) => Array.isArray(v) ? v.map(record) : [];
const key = (s: string) => s.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
// Reviewed against the KHL team IDs and the 2026-09-14 public Fonbet line.
const aliases: [string, string[]][] = [
  ['53',['Ак Барс']],['1',['Локомотив','Локомотив Ярославль']],['38',['Салават Юлаев']],['2',['ЦСКА']],
  ['37',['Металлург Мг','Металлург Магнитогорск']],['24',['СКА']],['7',['Спартак']],['26',['Торпедо НН','Торпедо']],
  ['25',['Трактор']],['66',['Лада']],['71',['Нефтехимик']],['198',['Барыс']],['34',['Авангард']],['56',['Северсталь']],
  ['29',['Сибирь']],['54',['Амур']],['207',['Динамо Минск']],['190',['Автомобилист']],['719',['Динамо Москва']],
  ['418',['Адмирал']],['451',['Сочи','ХК Сочи']],['568',['Шанхай Дрэгонс','Шанхайские Драконы']]
];
export function hockeyTeamId(name: string) { return aliases.find(([, names]) => names.some(n => key(n) === key(name)))?.[0] ?? null; }
export interface HockeyLineEvent { id: string; homeId: string; awayId: string; startsAt: Date; markets: HockeyMarket[] }
export function verifyHockeyDictionary(payload: unknown) {
  const tables = list(record(payload).groups).flatMap(g => list(g.tables));
  return tables.some(t => t.name === 'Исходы' && Array.isArray(t.rows) &&
    [921,922,923].every((id, i) => record((t.rows as unknown[][])[1]?.[i]).factorId === id && record((t.rows as unknown[][])[0]?.[i]).name === ['1','X','2'][i]));
}
export function parseHockeyLine(payload: unknown): HockeyLineEvent[] {
  const root = record(payload);
  if (!Array.isArray(root.events) || !Array.isArray(root.sports) || !Array.isArray(root.customFactors)) throw new Error('HOCKEY_LINE_SCHEMA');
  const sports = list(root.sports), hockey = sports.find(s => s.id === 2 && s.name === 'Хоккей');
  if (!hockey) throw new Error('HOCKEY_SPORT_UNVERIFIED');
  const competitions = new Set(sports.filter(s => s.parentId === 2 && /^Фонбет КХЛ\. (Регулярный сезон|Плей-офф)$/.test(String(s.name))).map(s => s.id));
  const events = list(root.events), factors = list(root.customFactors), result: HockeyLineEvent[] = [];
  for (const e of events) {
    if (!competitions.has(e.sportId) || e.parentId || e.level !== 1 || e.kind !== 1 || e.place !== 'line' || typeof e.team1 !== 'string' || typeof e.team2 !== 'string' || typeof e.startTime !== 'number') continue;
    const homeId = hockeyTeamId(e.team1), awayId = hockeyTeamId(e.team2), packs = factors.filter(f => f.e === e.id);
    if (!homeId || !awayId || homeId === awayId || !Number.isSafeInteger(e.id) || events.filter(x => x.id === e.id).length !== 1 || packs.length !== 1) continue;
    const startsAt = new Date(e.startTime * 1000); if (!Number.isFinite(startsAt.getTime())) continue;
    const items = list(packs[0].factors);
    const blocked = list(root.eventBlocks).some(b => b.eventId === e.id && b.state === 'blocked');
    const markets: HockeyMarket[] = [921,922,923].map((id, i) => {
      const matches = items.filter(f => f.f === id), f = matches[0];
      const available = !blocked && matches.length === 1 && typeof f.v === 'number' && Number.isFinite(f.v) && f.v > 1 && f.p == null;
      return { type: '1X2', scope: 'REGULATION_60', period: 0, selection: ['HOME','DRAW','AWAY'][i], line: null, odds: available ? f.v as number : null, status: available ? 'AVAILABLE' : 'SUSPENDED' };
    });
    result.push({ id: String(e.id), homeId, awayId, startsAt, markets });
  }
  return result;
}
export async function fetchHockeyJson(path: string, signal?: AbortSignal) {
  const base = process.env.FONBET_HOCKEY_BASE_URL ?? FONBET_PUBLIC_LINE_BASE_URL;
  const url = new URL(`${base.replace(/\/$/, '')}/${path}`); url.searchParams.set('lang', 'ru'); url.searchParams.set('scopeMarket', '1600');
  const response = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]), cache: 'no-store', redirect: 'error' });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`FONBET_HOCKEY_HTTP_${response.status}`); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('HOCKEY_LINE_EMPTY');
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 20 * 1024 * 1024) throw new Error('HOCKEY_LINE_SIZE'); chunks.push(value); } } finally { await reader.cancel(); }
  return { payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown, source: url.toString() };
}
