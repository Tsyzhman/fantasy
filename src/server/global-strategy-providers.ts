/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#data */
import { createHash } from "node:crypto";
import { FplPublicClient, type FplBootstrap } from "@/lib/providers/fpl";
import { sportsRuGraphqlRequest, SportsRuGraphqlHttpError } from "@/lib/providers/sports-ru-fantasy";
import { globalStrategyScoreHistory, type GlobalStrategyContext } from "@/machete/global-strategy";
import type { GlobalStrategyProvider } from "@/machete/global-strategy-config";

export class GlobalStrategySourceError extends Error {
  constructor(public readonly reason: string, public readonly squadOptions?: { id: string; label: string }[]) { super(reason); }
}
export const strategyRevision = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type StrategyBinding = { provider: GlobalStrategyProvider; contestId: string; tournamentKey: string; season: string; providerSeasonId: string; providerUserId: string; providerSquadId: string | null };
export type StrategySource = { context: GlobalStrategyContext; history: { id: string; score: number }[]; calendarRevision: string; sourceRevision: string; source: string; averageEntryScores?: { id: number; score: number | null }[] };
type Round = { id: string; deadline: number; finished: boolean };
function fail(reason: string): never { throw new GlobalStrategySourceError(reason); }
export function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numeric(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : fail("INVALID_INPUT"); }
function integer(value: unknown): number { const result = numeric(value); return Number.isSafeInteger(result) ? result : fail("INVALID_INPUT"); }

function makeSource(binding: StrategyBinding, now: Date, data: { n: number; rank: number; points: number; leader: number; roundId: string; rounds: Round[]; history: { id: string; score: number }[]; revision: unknown; squadId: string; source: string }): StrategySource {
  const rounds = data.rounds;
  if (!rounds.length || rounds.some((round) => !Number.isFinite(round.deadline)) || new Set(rounds.map((round) => round.id)).size !== rounds.length) fail("INCOMPLETE_CALENDAR");
  const scores = globalStrategyScoreHistory(data.history);
  if (!scores) fail("INSUFFICIENT_SCORE_HISTORY");
  const nextDeadline = Math.min(...rounds.filter((round) => round.deadline > +now).map((round) => round.deadline));
  const calendarRevision = strategyRevision(rounds);
  const sourceRevision = strategyRevision(data.revision);
  return { history: data.history.slice(-6), calendarRevision, sourceRevision, source: data.source,
    context: { provider: binding.provider, contestId: binding.contestId, tournamentKey: binding.tournamentKey,
      season: binding.season, providerSquadId: data.squadId, revision: strategyRevision([sourceRevision, calendarRevision, scores, data.squadId, data.rank, data.points]),
      fieldSize: data.n, rank: data.rank, managerPoints: data.points, leaderPoints: data.leader,
      totalRounds: rounds.length, remainingRounds: rounds.filter((round) => round.deadline > +now).length,
      roundScoreScale: scores.roundScoreScale, scoreSampleCount: scores.sampleCount, standingsRoundId: data.roundId,
      decisionRoundId: rounds.filter((round) => round.deadline > +now).sort((a, b) => a.deadline - b.deadline)[0]?.id,
      observedAt: now.toISOString(), expiresAt: new Date(Math.min(+now + 300_000, nextDeadline)).toISOString() } };
}

export function normalizeFplGlobalSource(binding: StrategyBinding, now: Date, bootstrap: FplBootstrap, entry: Record<string, unknown>, history: Record<string, unknown>, standings: Record<string, unknown>, entryAfter: Record<string, unknown>): StrategySource {
  if (binding.season !== "2026/2027" || bootstrap.events.length !== 38 || !Array.from({ length: 38 }, (_, i) => i + 1).every((id) => bootstrap.events.some((event) => event.id === id))) fail("INCOMPLETE_CALENDAR");
  // During live/recalculation FPL summary and Overall may represent different stages.
  const published = bootstrap.events.filter((event) => +event.deadlineTime <= +now);
  if (published.some((event) => !event.finished || !event.dataChecked)) fail("STANDINGS_RECALCULATING");
  const completed = published.filter((event) => event.finished && event.dataChecked).sort((a, b) => a.id - b.id);
  const roundId = completed.at(-1)?.id ?? 0;
  const keys = ["id", "current_event", "summary_overall_rank", "summary_overall_points"];
  if (keys.some((key) => entry[key] !== entryAfter[key]) || entry.current_event !== roundId || String(entry.id) !== binding.providerUserId) fail("INCOHERENT_STANDINGS");
  const league = record(standings.league);
  if (league.name !== "Overall" || league.league_type !== "s") fail("INVALID_OVERALL_LEAGUE");
  const rows = record(standings.standings).results;
  const leader = Array.isArray(rows) ? rows.map(record).find((row) => row.rank === 1) : null;
  const updated = Date.parse(String(standings.last_updated_data ?? ""));
  if (!leader || !Number.isFinite(updated) || updated > +now || (completed.length && updated < +completed.at(-1)!.deadlineTime)) fail("INCOHERENT_STANDINGS");
  const current = Array.isArray(history.current) ? history.current.map(record) : [];
  const latest = current.find((row) => row.event === roundId);
  if (roundId > 0 && (!latest || latest.total_points !== entry.summary_overall_points || latest.overall_rank !== entry.summary_overall_rank)) fail("INCOHERENT_STANDINGS");
  const scoreHistory = current.filter((row) => completed.some((event) => event.id === row.event)).sort((a, b) => integer(a.event) - integer(b.event)).map((row) => ({ id: String(integer(row.event)), score: numeric(row.points) }));
  const source = makeSource(binding, now, { n: integer(bootstrap.totalPlayers), rank: integer(entry.summary_overall_rank), points: numeric(entry.summary_overall_points), leader: numeric(leader.total), roundId: String(roundId),
    rounds: bootstrap.events.map((event) => ({ id: String(event.id), deadline: +event.deadlineTime, finished: event.finished && event.dataChecked })), history: scoreHistory,
    revision: [roundId, updated, bootstrap.totalPlayers, leader.total], squadId: binding.providerUserId, source: "FPL_OFFICIAL_OVERALL" });
  source.averageEntryScores = completed.slice(-6).map((event) => ({ id: event.id, score: event.averageEntryScore ?? null }));
  return source;
}

export type SharedStrategyRead = <T>(key: string, loader: () => Promise<T>) => Promise<T>;
const uncachedRead: SharedStrategyRead = (_key, loader) => loader();
export async function loadFplGlobalSource(binding: StrategyBinding, now: Date, client = new FplPublicClient({ maxAttempts: 2 }), shared: SharedStrategyRead = uncachedRead) {
  const bootstrap = await shared("calendar", async () => {
    const value = await client.getBootstrap();
    // Keep only calendar/global counts; ownership remains in the existing price pool.
    return { ...value, elements: [], teams: [], elementTypes: [], chips: [], gameConfig: {} };
  });
  const entry = await client.getEntry(binding.providerUserId);
  const leagues = record(entry.leagues).classic;
  const overall = Array.isArray(leagues) ? leagues.map(record).filter((league) => league.name === "Overall" && league.league_type === "s") : [];
  if (overall.length !== 1) fail("INVALID_OVERALL_LEAGUE");
  const standings = await shared(`standings:${integer(overall[0].id)}`, async () => {
    const value = await client.getOverallStandings(integer(overall[0].id));
    const rows = record(value.standings).results;
    return { league: { id: record(value.league).id, name: record(value.league).name, league_type: record(value.league).league_type }, last_updated_data: value.last_updated_data,
      standings: { results: (Array.isArray(rows) ? rows.map(record) : []).filter((row) => row.rank === 1).map((row) => ({ rank: row.rank, total: row.total })) } };
  });
  const history = await client.getEntryHistory(binding.providerUserId);
  const after = await client.getEntry(binding.providerUserId);
  return normalizeFplGlobalSource(binding, now, bootstrap, entry, history, standings, after);
}

// Tournament-specific full-season policies. Knockout/group-stage competitions deliberately require another policy.
const SPORTS_ROUNDS: Readonly<Record<string, number>> = { russia: 30, england: 38, spain: 38, italy: 38, germany: 34, france: 34, netherlands: 34, portugal: 34 };
const endpoint = "https://www.sports.ru/gql/graphql/";
export async function loadSportsGlobalSource(binding: StrategyBinding, now: Date, fetchImpl: typeof fetch = fetch, shared: SharedStrategyRead = uncachedRead): Promise<StrategySource> {
  const query = async (body: string) => {
    for (let attempt = 0; ; attempt++) {
      try { return record((await sportsRuGraphqlRequest<{ fantasyQueries: unknown }>(endpoint, `{ fantasyQueries { ${body} } }`, fetchImpl)).fantasyQueries); }
      catch (error) {
        // Do not retry a rate-limited request before Retry-After; return control to the user without polling.
        if (error instanceof SportsRuGraphqlHttpError && error.status === 429) fail("PROVIDER_RATE_LIMITED");
        const transient = error instanceof TypeError || (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name)) || (error instanceof SportsRuGraphqlHttpError && error.status >= 500);
        if (!transient) throw error;
        if (attempt >= 1) fail("PROVIDER_UNAVAILABLE");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  };
  const hru = JSON.stringify(binding.tournamentKey);
  const seasonId = JSON.stringify(binding.providerSeasonId);
  const season = await shared("calendar", async () => record(record((await query(`tournament(id:${hru},source:HRU) { currentSeason { id totalSquadsCount tours { id status startedAt finishedAt } } }`)).tournament).currentSeason));
  if (season.id !== binding.providerSeasonId) fail("SEASON_MISMATCH");
  const tours = Array.isArray(season.tours) ? season.tours.map(record) : [];
  if (!SPORTS_ROUNDS[binding.tournamentKey] || tours.length !== SPORTS_ROUNDS[binding.tournamentKey]) fail("INCOMPLETE_CALENDAR");
  if (tours.some((tour) => Date.parse(String(tour.startedAt)) <= +now && tour.status !== "FINISHED")) fail("STANDINGS_RECALCULATING");
  const profile = await query(`squads(input:{userID:${JSON.stringify(binding.providerUserId)},isActiveTournament:true}) { id name season { id } }`);
  const squads = (Array.isArray(profile.squads) ? profile.squads.map(record) : []).filter((squad) => record(squad.season).id === binding.providerSeasonId && (!binding.providerSquadId || squad.id === binding.providerSquadId));
  if (squads.length > 1) throw new GlobalStrategySourceError("SELECT_PROVIDER_SQUAD", squads.slice(0, 20).map((squad) => ({ id: String(squad.id), label: String(squad.name ?? squad.id) })));
  if (squads.length === 0) fail("PROFILE_SQUAD_NOT_FOUND");
  const squadId = String(squads[0].id);
  const snapshotQuery = `squads(input:{squadID:${JSON.stringify(squadId)},seasonID:${seasonId}}) { id seasonScoreInfo { place score totalPlaces } } rating { squads(input:{entityID:${seasonId},entityType:SEASON,sortOrder:DESC,pageSize:2,pageNum:1}) { list { scoreInfo { place score totalPlaces } } } }`;
  const before = await query(snapshotQuery);
  const completed = tours.filter((tour) => tour.status === "FINISHED").sort((a, b) => Date.parse(String(a.startedAt)) - Date.parse(String(b.startedAt)));
  const used = completed.slice(-6);
  const historic = used.length ? await query(used.map((tour, index) => `r${index}:squadTourInfo(input:{squadID:${JSON.stringify(squadId)},tourID:${JSON.stringify(tour.id)}}) { scoreInfo { score } }`).join(" ")) : {};
  const after = await query(snapshotQuery);
  if (strategyRevision(before) !== strategyRevision(after)) fail("INCOHERENT_STANDINGS");
  const manager = record(record(Array.isArray(before.squads) ? before.squads[0] : null).seasonScoreInfo);
  const ratings = record(record(before.rating).squads).list;
  const leader = record(record(Array.isArray(ratings) ? ratings[0] : null).scoreInfo);
  if (leader.place !== 1 || leader.totalPlaces !== manager.totalPlaces) fail("INCOHERENT_STANDINGS");
  return makeSource(binding, now, { n: integer(manager.totalPlaces), rank: integer(manager.place), points: numeric(manager.score), leader: numeric(leader.score),
    roundId: String(completed.at(-1)?.id ?? "preseason"), rounds: tours.map((tour) => ({ id: String(tour.id), deadline: Date.parse(String(tour.startedAt)), finished: tour.status === "FINISHED" })),
    history: used.flatMap((tour, index) => {
      const info = historic[`r${index}`];
      if (info === null) return []; // No participation; a numeric zero remains an observation.
      const score = record(record(info).scoreInfo).score;
      if (typeof score !== "number" || !Number.isFinite(score)) fail("INSUFFICIENT_SCORE_HISTORY");
      return [{ id: String(tour.id), score }];
    }),
    revision: [leader, completed.at(-1)?.id], squadId, source: "SPORTS_RU_OFFICIAL_SEASON" });
}
