// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import { Prisma, type PrismaClient } from "@prisma/client";

const dayMs = 86_400_000;
const matchAvailabilityDelay = 4 * 60 * 60_000;
const historyDays = 120;
const teamFields = [
  "goals", "xg", "xgot", "xa", "shots", "shots_on_target", "shots_off_target", "blocked_shots",
  "big_chances", "big_chances_missed", "touches_in_opp_box", "possession", "passes", "accurate_passes",
  "pass_accuracy", "corners", "offsides", "fouls", "yellow_cards", "red_cards", "tackles_won",
  "interceptions", "clearances", "saves"
] as const;
const playerFields = [
  "goals", "assists", "yellow_cards", "red_cards", "saves", "goals_conceded", "xg", "xgot", "xa",
  "shots", "shots_on_target", "key_passes", "chances_created", "tackles_won", "interceptions",
  "clearances", "duels_won", "aerials_won", "recoveries", "touches_in_opp_box", "fouls_won", "penalties_won", "rating"
] as const;
type Values = Array<number | null>;
type TeamRow = [string, string, Values, Values, string | null];
type PlayerRow = [string, string, string, number | null, boolean | null, boolean | null, Values];
type OddsRow = [string, number | null, number | null, number | null, number | null];
export type FivePlusHistoryRow = {
  match: string;
  kickoff: string;
  created: string;
  home: string;
  away: string;
  teams: TeamRow[];
  players: PlayerRow[];
};
export type FivePlusOddsRow = { odds: string; snapshot: OddsRow };

const fields = (alias: string, columns: readonly string[]) => Prisma.raw(columns.map((column) => alias + "." + column).join(", "));

export function squadFivePlusHistoryQuery(teamScope: Prisma.Sql, start: Date, end: Date) {
  return Prisma.sql`
    WITH teams AS MATERIALIZED (${teamScope}),
    eligible AS MATERIALIZED (
      SELECT m.id, m.match_date, m.created_at, m.home_team_id, m.away_team_id
      FROM matches m
      JOIN (
        SELECT h.id FROM teams t JOIN matches h ON h.home_team_id=t.id
          AND h.match_date >= ${start} AND h.match_date < ${end}
        UNION
        SELECT a.id FROM teams t JOIN matches a ON a.away_team_id=t.id
          AND a.match_date >= ${start} AND a.match_date < ${end}
      ) found ON found.id=m.id
      WHERE m.finished AND NOT m.cancelled AND m.home_team_id IS NOT NULL AND m.away_team_id IS NOT NULL
    )
    SELECT jsonb_build_object('match', m.id::text, 'kickoff', m.match_date, 'created', m.created_at,
      'home', m.home_team_id::text, 'away', m.away_team_id::text,
      'teams', coalesce(t.rows, '[]'::jsonb), 'players', coalesce(p.rows, '[]'::jsonb)) AS history
    FROM eligible m
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_array(s.team_id::text, greatest(s.created_at,s.updated_at),
        jsonb_build_array(${fields("s", teamFields)}),
        jsonb_build_array(${fields("o", teamFields)}),
        greatest(o.created_at,o.updated_at))
        ORDER BY s.team_id) AS rows
      FROM match_team_stats s LEFT JOIN match_team_stats o
        ON o.match_id=s.match_id AND o.team_id<>s.team_id
        AND o.team_id IN (m.home_team_id,m.away_team_id)
      WHERE s.match_id=m.id AND s.team_id IN (m.home_team_id,m.away_team_id)
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_array(s.player_id::text,s.team_id::text,greatest(s.created_at,s.updated_at),
        s.minutes,s.started,s.clean_sheet,jsonb_build_array(${fields("s", playerFields)}))
        ORDER BY s.player_id) AS rows
      FROM match_player_stats s
      JOIN teams t ON t.id=s.team_id
      WHERE s.match_id=m.id AND s.minutes > 0
    ) p ON true
    ORDER BY m.match_date,m.id
  `;
}

export function squadFivePlusOddsQuery(matchScope: Prisma.Sql) {
  return Prisma.sql`
    SELECT jsonb_build_object('odds', s.match_id::text, 'snapshot',
      jsonb_build_array(s.fetched_at, s.home_over_15_probability, s.away_over_15_probability,
        s.home_clean_sheet_probability,s.away_clean_sheet_probability)) AS history
    FROM fixture_odds_snapshots s JOIN (${matchScope}) m ON s.match_id=m.id
    WHERE s.provider='FONBET' AND s.status='AVAILABLE' AND s.fetched_at >= s.updated_at - interval '1 minute'
    ORDER BY s.match_id
  `;
}

type MatchContext = {
  id: string;
  kickoff: number;
  available: number;
  home: boolean;
  own?: Values;
  ownAvailable?: number;
  against?: Values;
  againstAvailable?: number;
};
type PlayerContext = { id: string; kickoff: number; available: number; minutes: number; start: boolean; clean: boolean | null; values: Values };

function time(value: string) {
  return Date.parse(/(?:[zZ]|[+-]\d\d:\d\d)$/.test(value) ? value : value + "Z");
}

export class SquadFivePlusHistory {
  private readonly teams = new Map<string, MatchContext[]>();
  private readonly players = new Map<string, PlayerContext[]>();
  private readonly markets = new Map<string, OddsRow>();

  constructor(rows: Iterable<FivePlusHistoryRow | FivePlusOddsRow>) {
    const seen = new Set<string>();
    for (const row of rows) {
      if ("odds" in row) {
        if (this.markets.has(row.odds)) throw new Error("Duplicate market in Squad forecast history");
        this.markets.set(row.odds, row.snapshot);
        continue;
      }
      if (seen.has(row.match)) throw new Error("Duplicate match in Squad forecast history");
      seen.add(row.match);
      const kickoff = time(row.kickoff);
      const available = Math.max(time(row.created), kickoff + matchAvailabilityDelay);
      for (const [id, home] of [[row.home, true], [row.away, false]] as const) {
        const list = this.teams.get(id) ?? [];
        list.push({ id: row.match, kickoff, available, home });
        this.teams.set(id, list);
      }
      for (const [id, observedAt, own, against, againstAt] of row.teams) {
        const list = this.teams.get(id);
        const match = list?.at(-1);
        if (match?.id !== row.match) continue;
        match.own = own;
        match.against = against;
        match.againstAvailable = againstAt ? time(againstAt) : Infinity;
        match.ownAvailable = time(observedAt);
      }
      for (const [id, team, observedAt, minutes, started, clean, values] of row.players) {
        if (!minutes) continue;
        const key = team + ":" + id;
        const list = this.players.get(key) ?? [];
        list.push({ id: row.match, kickoff, available: Math.max(available, time(observedAt)), minutes, start: started === true, clean, values });
        this.players.set(key, list);
      }
    }
  }

  market(matchId: string | undefined, asOf: number, home: boolean): Values {
    const odds = matchId ? this.markets.get(matchId) : undefined;
    if (!odds) return [null, null, null, null];
    const fetched = time(odds[0]);
    if (!(fetched < asOf) || asOf - fetched > 35 * dayMs) return [null, null, null, null];
    const [, homeGoals, awayGoals, homeClean, awayClean] = odds;
    return home ? [homeGoals, awayGoals, homeClean, awayClean] : [awayGoals, homeGoals, awayClean, homeClean];
  }

  team(teamId: string, asOf: number, nextKickoff: number, home: boolean): Array<number | null> {
    const matches = knownRecent(this.teams.get(teamId), asOf, 24);
    const daysSince = (kickoff: number) => (nextKickoff - kickoff) / dayMs;
    const statistics = (side: "own" | "against") => {
      const recent = matches.filter((match) => (match[side === "own" ? "ownAvailable" : "againstAvailable"] ?? Infinity) < asOf);
      return teamFields.flatMap((_, index) => [
        mean(recent.slice(0, 5).map((match) => match[side]?.[index])),
        mean(recent.slice(0, 12).map((match) => match[side]?.[index]))
      ]);
    };
    const sameVenue = matches.filter((match) => match.home === home).slice(0, 8);
    return [
      matches.length,
      matches[0] ? daysSince(matches[0].kickoff) : null,
      ...[7, 14, 28].map((days) => matches.filter(({ kickoff }) => daysSince(kickoff) <= days).length),
      ...[0, 1, 4, 5].flatMap((index) => [
        mean(sameVenue.map((match) => (match.ownAvailable ?? Infinity) < asOf ? match.own?.[index] : null)),
        mean(sameVenue.map((match) => (match.againstAvailable ?? Infinity) < asOf ? match.against?.[index] : null))
      ]),
      ...statistics("own"), ...statistics("against")
    ];
  }

  player(teamId: string, playerId: string, asOf: number, nextKickoff: number): Array<number | null> {
    const matches = knownRecent(this.players.get(teamId + ":" + playerId), asOf, 16);
    const daysSince = (kickoff: number) => (nextKickoff - kickoff) / dayMs;
    const lastStart = matches.find((match) => match.start);
    return [
      matches.length,
      matches[0] ? daysSince(matches[0].kickoff) : null,
      lastStart ? daysSince(lastStart.kickoff) : null,
      ...[7, 14, 28].flatMap((days) => {
        const recent = matches.filter(({ kickoff }) => daysSince(kickoff) <= days);
        return [recent.length, recent.reduce((sum, { minutes }) => sum + minutes, 0), recent.filter((match) => match.start).length];
      }),
      ...[3, 8].flatMap((count) => {
        const recent = matches.slice(0, count);
        return [
          mean(recent.map(({ minutes }) => minutes)),
          mean(recent.map(({ start }) => Number(start))),
          mean(recent.map(({ clean }) => clean === null ? null : Number(clean))),
          ...playerFields.map((field, i) => field === "rating"
            ? mean(recent.map((match) => match.values[i]))
            : per90(recent, i))
        ];
      })
    ];
  }
}

function mean(values: Array<number | null | undefined>) {
  const numeric = values.filter((value): value is number => value !== null && value !== undefined);
  return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;
}

function per90(rows: PlayerContext[], index: number) {
  let minutes = 0;
  let total = 0;
  for (const row of rows) {
    const value = row.values[index];
    if (value === null || value === undefined) continue;
    total += value;
    minutes += row.minutes;
  }
  return minutes ? 90 * total / Math.max(180, minutes) : null;
}

function knownRecent<T extends { available: number; kickoff: number }>(history: T[] | undefined, asOf: number, limit: number) {
  if (!history) return [];
  const rows: T[] = [];
  const earliest = asOf - historyDays * dayMs;
  for (let i = history.length - 1; i >= 0 && rows.length < limit; i--) {
    const match = history[i];
    if (match.kickoff < earliest) break;
    if (match.available < asOf) rows.push(match);
  }
  return rows;
}

export async function loadSquadFivePlusHistory(prisma: Pick<PrismaClient, "$queryRaw">, teamIds: bigint[], matchIds: bigint[], asOf: Date) {
  if (teamIds.length === 0) return new SquadFivePlusHistory([]);
  const teamScope = Prisma.sql`SELECT unnest(ARRAY[${Prisma.join(teamIds)}]::bigint[]) AS id`;
  const start = new Date(+asOf - historyDays * dayMs);
  const [matches, odds] = await Promise.all([
    prisma.$queryRaw<Array<{ history: FivePlusHistoryRow }>>(squadFivePlusHistoryQuery(teamScope, start, asOf)),
    matchIds.length ? prisma.$queryRaw<Array<{ history: FivePlusOddsRow }>>(
      squadFivePlusOddsQuery(Prisma.sql`SELECT unnest(ARRAY[${Prisma.join(matchIds)}]::bigint[]) AS id`)
    ) : []
  ]);
  return new SquadFivePlusHistory([...matches, ...odds].map(({ history }) => history));
}

export const squadFivePlusHistoryFeatureCounts = {
  team: 13 + teamFields.length * 4,
  player: 12 + (3 + playerFields.length) * 2
};
