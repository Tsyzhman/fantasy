/** @spec spec://modules/mixerr/FEAT-014-passing-networks#input
 * @spec spec://modules/mixerr/FEAT-014-passing-networks#aggregation
 */

export const MAX_PASSING_FILE_BYTES = 5 * 1024 * 1024;
export const MIN_LINK_PASSES = 3;
const MAX_EVENTS = 12_000;

type Point = { x: number; y: number };
type Starter = { id: number; name: string; shirtNumber: number };
type Lineup = { teamId: number; name: string; starters: Map<number, Starter> };
type MatchEvent = {
  index: number;
  period: number;
  minute: number;
  second: number;
  type: string;
  teamId: number | null;
  raw: Record<string, unknown>;
};

export type PassingNetwork = {
  teamId: number;
  teamName: string;
  cutoff: string;
  reason: "substitution" | "dismissal" | "fullTime";
  passes: number;
  players: Array<Starter & Point>;
  links: Array<{ from: number; to: number; count: number }>;
};

export class PassingFileError extends Error {
  constructor(readonly code: "invalid" | "duplicates" | "incomplete" | "tooLarge") {
    super(code);
  }
}

export function readPassingNetworks(source: unknown): PassingNetwork[] {
  if (!Array.isArray(source) || source.length === 0) throw new PassingFileError("invalid");
  if (source.length > MAX_EVENTS) throw new PassingFileError("tooLarge");

  const eventIds = new Set<string>();
  const indices = new Set<number>();
  const events = source.map((item: unknown): MatchEvent => {
    const raw = record(item);
    const { id, index, period, minute, second } = raw;
    const type = record(raw.type).name;
    if (typeof id !== "string" || id.length === 0 || !isInteger(index, 1, Number.MAX_SAFE_INTEGER) ||
      !isInteger(period, 1, 5) || !isInteger(minute, 0, 180) || !isInteger(second, 0, 59) || typeof type !== "string") {
      throw new PassingFileError("invalid");
    }
    if (eventIds.has(id) || indices.has(index)) throw new PassingFileError("duplicates");
    eventIds.add(id);
    indices.add(index);
    return { index, period, minute, second, type, teamId: identityId(raw.team), raw };
  }).sort((a, b) => a.index - b.index);

  const lineups = events.filter((event) => event.type === "Starting XI" && event.period === 1).map(readLineup);
  if (lineups.length !== 2 || lineups[0].teamId === lineups[1].teamId) throw new PassingFileError("invalid");

  const lastPeriod = events.reduce((latest, event) => event.period < 5 ? Math.max(latest, event.period) : latest, 0);
  const endEvents = lineups.map(({ teamId }) => events.find((event) =>
    event.type === "Half End" && event.period === lastPeriod && event.teamId === teamId
  ));
  const [firstEnd, secondEnd] = endEvents;
  if (lastPeriod < 2 || !firstEnd || !secondEnd || endEvents.some((event) => {
    const end = record(event?.raw.half_end);
    return end.early_video_end === true || end.match_suspended === true;
  })) throw new PassingFileError("incomplete");
  const matchEnd = firstEnd.index > secondEnd.index ? firstEnd : secondEnd;
  if (events.some((event) => event.index > matchEnd.index && event.period < 5 && event.type === "Pass")) {
    throw new PassingFileError("incomplete");
  }

  return lineups.map((lineup) => buildNetwork(lineup, events, matchEnd));
}

function readLineup(event: MatchEvent): Lineup {
  const name = record(event.raw.team).name;
  const lineup = record(event.raw.tactics).lineup;
  if (event.teamId === null || typeof name !== "string" || !name.trim() || !Array.isArray(lineup) || lineup.length !== 11) {
    throw new PassingFileError("invalid");
  }
  const starters = new Map<number, Starter>();
  for (const item of lineup) {
    const { player, jersey_number: shirtNumber } = record(item);
    const id = identityId(player);
    const playerName = record(player).name;
    if (id === null || typeof playerName !== "string" || !playerName.trim() || !isInteger(shirtNumber, 0, 999) || starters.has(id)) {
      throw new PassingFileError("invalid");
    }
    starters.set(id, { id, name: playerName, shirtNumber });
  }
  return { teamId: event.teamId, name, starters };
}

function buildNetwork(lineup: Lineup, events: readonly MatchEvent[], matchEnd: MatchEvent): PassingNetwork {
  const { teamId, name, starters } = lineup;
  const change = events.find((event) => event.teamId === teamId && event.index < matchEnd.index &&
    (event.type === "Substitution" || isStarterDismissal(event, starters)));
  const stop = change ?? matchEnd;
  const positions = new Map<number, Point & { observations: number }>();
  const links = new Map<string, PassingNetwork["links"][number]>();
  let passes = 0;

  for (const event of events) {
    if (event.index >= stop.index) break;
    if (event.teamId !== teamId || event.type !== "Pass" || event.period === 5) continue;

    const pass = record(event.raw.pass);
    if (pass.outcome != null) continue;
    const from = identityId(event.raw.player);
    const to = identityId(pass.recipient);
    if (from === null || to === null || from === to || !starters.has(from) || !starters.has(to)) continue;
    const origin = pitchPoint(event.raw.location);
    const target = pitchPoint(pass.end_location);
    if (!origin || !target) continue;

    addPosition(positions, from, origin);
    addPosition(positions, to, target);
    const key = `${from}:${to}`;
    const link = links.get(key);
    if (link) link.count += 1;
    else links.set(key, { from, to, count: 1 });
    passes += 1;
  }

  const players: PassingNetwork["players"] = [];
  for (const [id, starter] of starters) {
    const position = positions.get(id);
    if (position) players.push({ ...starter, x: position.x / position.observations, y: position.y / position.observations });
  }
  players.sort((a, b) => a.shirtNumber - b.shirtNumber);
  return {
    teamId,
    teamName: name,
    cutoff: matchClock(stop),
    reason: change ? (change.type === "Substitution" ? "substitution" : "dismissal") : "fullTime",
    passes,
    players,
    links: [...links.values()]
  };
}

function isStarterDismissal(event: MatchEvent, starters: Map<number, Starter>) {
  if (event.type !== "Foul Committed" && event.type !== "Bad Behaviour") return false;
  const details = event.type === "Foul Committed" ? event.raw.foul_committed : event.raw.bad_behaviour;
  const card = record(record(details).card).name;
  const player = identityId(event.raw.player);
  return (card === "Red Card" || card === "Second Yellow") && player !== null && starters.has(player);
}

function matchClock(event: MatchEvent) {
  const endOfPeriod = [45, 90, 105, 120][event.period - 1];
  const minute = event.minute > endOfPeriod ? `${endOfPeriod}+${event.minute - endOfPeriod}` : String(event.minute);
  return `${minute}:${String(event.second).padStart(2, "0")}`;
}

function pitchPoint(value: unknown): Point | null {
  if (!Array.isArray(value)) return null;
  const [x, y] = value;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) ||
    x < 0 || x > 120 || y < 0 || y > 80) return null;
  return { x, y };
}

function addPosition(positions: Map<number, Point & { observations: number }>, id: number, point: Point) {
  const total = positions.get(id);
  if (total) {
    total.x += point.x;
    total.y += point.y;
    total.observations += 1;
  } else {
    positions.set(id, { ...point, observations: 1 });
  }
}

function identityId(value: unknown) {
  const { id } = record(value);
  return isInteger(id, 1, Number.MAX_SAFE_INTEGER) ? id : null;
}

function isInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
