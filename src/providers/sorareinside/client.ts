/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#source */
const API = "https://platform-api.sorareinside.com";
const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sourceId(value: unknown): string {
  if (typeof value !== "string") throw new Error("SorareInside: missing ID");
  const id = value.replace(/^(Club|Player|Game|NationalTeam):/, "").toLowerCase();
  if (!UUID.test(id)) throw new Error("SorareInside: invalid ID");
  return id;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SorareInside: invalid object");
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("SorareInside: invalid list");
  return value;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("SorareInside: invalid string");
  return value;
}
function date(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("SorareInside: invalid date");
  return new Date(result).toISOString();
}
export type SourceTeam = { id: string; name: string; slug: string; country: string; national: boolean };
export type SourceGame = { id: string; kickoff: string; status: string; home: SourceTeam; away: SourceTeam; homeLineup: string | null; awayLineup: string | null };
export type NextTeamGame = { team: SourceTeam; opponent: SourceTeam; game: SourceGame; lineupId: string | null; home: boolean };
export type SourcePlayer = { id: string; name: string; slug: string; birthDate: string | null; position: string; index: number };
export type SourceLineup = { id: string; gameId: string; teamId: string; updatedAt: string; formation: string; players: SourcePlayer[] };

function parseTeam(input: unknown): SourceTeam {
  const t = object(input);
  return { id: sourceId(t.id), name: string(t.name), slug: string(t.slug), country: string(object(t.country).code).toLowerCase(), national: String(t.id).startsWith("NationalTeam:") };
}
export function parseGames(input: unknown): SourceGame[] {
  return list(input).flatMap(region => list(object(region).competitions).flatMap(competition => list(object(competition).games).map(value => {
    const g = object(value);
    const status = string(g.statusTyped);
    if (!["scheduled", "playing", "played", "cancelled", "postponed", "suspended", "interrupted"].includes(status)) throw new Error(`SorareInside: unknown match status ${status.slice(0,30)}`);
    const lineupId = (value: unknown) => value == null ? null : object(value).is_published === true ? sourceId(object(value).id) : null;
    return { id: sourceId(g.id), kickoff: date(g.date), status, home: parseTeam(g.homeTeam), away: parseTeam(g.awayTeam), homeLineup: lineupId(g.homeTeamLineup), awayLineup: lineupId(g.awayTeamLineup) };
  })));
}

// Choose the fixture BEFORE inspecting its lineup. Missing predictions must not
// accidentally select next week's fixture or another competition's later game.
export function nearestTeamGames(games: SourceGame[], now: Date): Map<string, NextTeamGame> {
  const unique = new Map<string, SourceGame>();
  for (const game of games) {
    const previous = unique.get(game.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(game)) throw new Error("SorareInside: conflicting duplicate fixture");
    unique.set(game.id, game);
  }
  const result = new Map<string, NextTeamGame>();
  for (const game of [...unique.values()].sort((a,b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))) {
    if (game.status !== "scheduled" || Date.parse(game.kickoff) <= now.getTime()) continue;
    for (const home of [true, false]) {
      const team = home ? game.home : game.away;
      if (team.national) continue;
      const existing = result.get(team.id);
      if (existing?.game.kickoff === game.kickoff && existing.game.id !== game.id) throw new Error("SorareInside: ambiguous simultaneous fixtures");
      if (!existing) result.set(team.id, { team, opponent: home ? game.away : game.home, game, home, lineupId: home ? game.homeLineup : game.awayLineup });
    }
  }
  return result;
}

export function parseLineup(input: unknown, selected: NextTeamGame): SourceLineup {
  const l = object(input);
  if (sourceId(l.id) !== selected.lineupId || sourceId(l.game_id) !== selected.game.id || sourceId(object(l.team).id) !== selected.team.id || l.is_published !== true) throw new Error("SorareInside: lineup does not match selected fixture/team or is unpublished");
  const players = list(object(l.lineup_players).starting_players).map(value => {
    const p = object(value);
    if (!Number.isInteger(p.lineup_position_index) || Number(p.lineup_position_index) < 0 || Number(p.lineup_position_index) > 10) throw new Error("SorareInside: invalid lineup position");
    return { id: sourceId(p.id), name: string(p.display_name), slug: string(p.slug), birthDate: p.birth_date == null ? null : date(p.birth_date).slice(0,10), position: string(p.position), index: Number(p.lineup_position_index) };
  }).sort((a,b) => a.index-b.index);
  if (players.length !== 11 || new Set(players.map(p=>p.id)).size !== 11 || new Set(players.map(p=>p.index)).size !== 11 || players.filter(p=>p.position === "Goalkeeper").length !== 1 || players[0].position !== "Goalkeeper") throw new Error("SorareInside: expected 11 unique starters with one goalkeeper first");
  return { id: sourceId(l.id), gameId: sourceId(l.game_id), teamId: selected.team.id, updatedAt: date(l.updated_at), formation: string(l.formation), players };
}

/** Bounded HTTP session, no response bodies or account data in errors/logs. */
export class SorareInsideClient {
  private cookies = new Map<string,string>();
  private lastRequestAt = 0;
  constructor(private credentials: { email: string; password: string }, private fetcher: typeof fetch = fetch) {}
  private async request(path: string, login = false): Promise<unknown> {
    const delay = 150 - (Date.now() - this.lastRequestAt);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    this.lastRequestAt = Date.now();
    const response = await this.fetcher(API + path, {
      method: login ? "POST" : "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
      headers: { "content-type": "application/json", origin: "https://sorareinside.com", cookie: [...this.cookies].map(([k,v])=>`${k}=${v}`).join("; ") },
      ...(login ? { body: JSON.stringify(this.credentials) } : {})
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";",1)[0]; const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0,index),pair.slice(index+1));
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`SorareInside HTTP ${response.status}`); }
    const reader = response.body?.getReader(); if (!reader) throw new Error("SorareInside: empty response");
    const chunks: Uint8Array[] = []; let size=0;
    try {
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error("SorareInside: response size limit"); } chunks.push(chunk.value); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch (error) { if (error instanceof SyntaxError) throw new Error("SorareInside: invalid JSON"); throw error; }
    finally { reader.releaseLock(); }
  }
  async get(path: string): Promise<unknown> {
    if (!this.cookies.size) await this.request("/auth/login",true);
    try { return await this.request(path); }
    catch (error) { if (!(error instanceof Error) || error.message !== "SorareInside HTTP 401") throw error; this.cookies.clear(); await this.request("/auth/login",true); return this.request(path); }
  }
  async schedule(now: Date): Promise<SourceGame[]> {
    const weeks = list(await this.get("/gameweeks")).map(value=> { const w=object(value); return { slug: string(w.slug), start: date(w.startDate), end: date(w.endDate) }; });
    const selected = weeks.filter(w=>Date.parse(w.end)>now.getTime() && Date.parse(w.start)<now.getTime()+14*86400000);
    if (!selected.length || selected.length>10 || !selected.some(w=>Date.parse(w.start)<=now.getTime())) throw new Error("SorareInside: incomplete gameweek coverage");
    const games: SourceGame[] = [];
    for (const week of selected) games.push(...parseGames(await this.get(`/games?gameweekSlug=${encodeURIComponent(week.slug)}&onlyUserPlayersTeams=false&includeGamesStats=false`)));
    games.push(...parseGames(await this.get("/games?scheduledLineups=true&onlyUserPlayersTeams=false&includeGamesStats=false")));
    if (!games.length || games.length>10000) throw new Error("SorareInside: invalid schedule size");
    return games;
  }
  async lineup(selected: NextTeamGame) { return parseLineup(await this.get(`/lineups/${sourceId(selected.lineupId)}`), selected); }
}
