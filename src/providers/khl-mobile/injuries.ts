/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#runtime */
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

export function parseKhlInjuries(raw: string, season: string, clubs: string[]) {
  const payload = JSON.parse(raw), injured: string[] = [], seen = new Set<string>();
  if (Object.keys(payload).length !== clubs.length) throw new Error('INJURY_CLUBS_INVALID');
  for (const club of clubs) {
    const r = payload[club], data = r?.data;
    if (r?.status !== 'success' || !String(data?.photo).startsWith(`//img.khl.ru/teamphoto/${season}/${club}/`)) throw new Error('INJURY_SCOPE_INVALID');
    const groups = data.players;
    if (!groups || !['goalkeepers', 'defenders', 'forwards'].every(key => Array.isArray(groups[key]) && groups[key].length > 0) || groups.injured !== undefined && !Array.isArray(groups.injured)) throw new Error('INJURY_ROSTER_INVALID');
    for (const group of ['goalkeepers', 'defenders', 'forwards', 'injured']) for (const p of groups[group] ?? []) {
      const id = String(p.id);
      if (!/^\d{1,12}$/.test(id) || p.link !== `/players/${id}/` || seen.has(id)) throw new Error('INJURY_PLAYER_INVALID');
      seen.add(id);
      if (group === 'injured') injured.push(id);
    }
  }
  return injured;
}

export async function fetchKhlInjuries(season: string, clubs: string[]) {
  if (!/^\d{1,10}$/.test(season) || clubs.length < 1 || clubs.length > 32 || clubs.some(c => !/^\d{1,10}$/.test(c))) throw new Error('INJURY_SCOPE_INVALID');
  const raw = await new Promise<string>((accept, reject) => {
    execFile(process.env.KHL_HTTP_PYTHON ?? '/opt/khl-http/bin/python3', [resolve('scripts/khl-protocol-http.py'), 'clubs', season, clubs.join(',')],
      { timeout: 180000, killSignal: 'SIGKILL', maxBuffer: 5 * 1024 * 1024, encoding: 'utf8', windowsHide: true },
      (error, stdout) => error ? reject(new Error('INJURY_TRANSPORT_FAILED')) : accept(stdout));
  });
  return parseKhlInjuries(raw, season, clubs);
}
