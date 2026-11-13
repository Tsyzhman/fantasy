// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { fivePlusFixtureFeatures, fivePlusPlayerFeatures } from "../../src/machete/squad-research-five-plus-features";
import { SquadFivePlusHistory, type FivePlusHistoryRow, type FivePlusOddsRow } from "../../src/machete/squad-research-five-plus-history";
import { sportsRuResearchRidge } from "../../src/machete/squad-research-ridge";
import { squadResearchForecasts } from "../../src/machete/squad-research-columns";
import {
  researchFixtureInput, researchFixturePoints, researchRidgeFeatures, researchStudyCandidates,
  type ResearchFixtureInput, type ResearchRidge, type ResearchStudyCandidate
} from "../../src/machete/squad-research-forecast";

class Metric {
  n = 0;
  ae = 0;
  se = 0;
  bias = 0;
  rounds = 0;
  rankSum = 0;
  rankN = 0;
  topSum = 0;
  topN = 0;
  topK = 15;
  rmse() { return Math.sqrt(this.se / this.n); }
  addRound(actual: number[], predicted: number[]) {
    this.rounds++;
    for (let i = 0; i < actual.length; i++) {
      const error = predicted[i] - actual[i];
      this.ae += Math.abs(error);
      this.se += error ** 2;
      this.bias += error;
      this.n++;
    }
    const rank = spearman(actual, predicted);
    if (rank !== null) { this.rankSum += rank; this.rankN++; }
    if (actual.length >= this.topK) {
      this.topSum += sortedIndexes(predicted, true).slice(0, this.topK).reduce((sum, i) => sum + actual[i], 0) / this.topK;
      this.topN++;
    }
  }
  result() {
    const round = (x: number) => Number.isFinite(x) ? Number(x.toFixed(5)) : null;
    return {
      rows: this.n, rounds: this.rounds, rmse: round(this.rmse()), mae: round(this.ae / this.n),
      bias: round(this.bias / this.n), spearman: round(this.rankSum / this.rankN), top15: round(this.topSum / this.topN)
    };
  }
}

const [roundPath, scorePath, cutoffArg] = process.argv.slice(2);
if (!roundPath || !scorePath || !cutoffArg || !Number.isFinite(Date.parse(cutoffArg))) {
  throw new Error("Usage: tsx scripts/research/backtest-squad-research.ts ROUNDS.jsonl SCORES.jsonl AS_OF_ISO");
}
const [historyPath, trainingPath] = process.argv.slice(5);
if (Boolean(historyPath) !== Boolean(trainingPath)) {
  throw new Error("Provide both the match-history JSONL input and the five-plus training JSONL output.");
}
const historyRows: Array<FivePlusHistoryRow | FivePlusOddsRow> = [];
if (historyPath) await readLines<FivePlusHistoryRow | FivePlusOddsRow>(historyPath, (row) => { historyRows.push(row); });
const fivePlusHistory = historyPath ? new SquadFivePlusHistory(historyRows) : null;
historyRows.length = 0;
const fivePlusTraining = trainingPath ? createWriteStream(trainingPath, { flags: "wx" }) : null;
if (fivePlusTraining) await once(fivePlusTraining, "open");

const day = 24 * 60 * 60 * 1000;
const selectionStart = Date.parse("2026-10-09T00:00:00Z");
const holdoutStart = Date.parse("2026-10-23T00:00:00Z");
const cutoff = Date.parse(cutoffArg);
const phases = ["train", "selection", "holdout"] as const;
type Phase = typeof phases[number];
type Fixture = [string, string, string, string, string, string, boolean, string, string, string];
type Official = [string, number, number, number, number, number, number, number, number, number];
type ScoreFile = { season: string; id: string; home: Official[] | null; away: Official[] | null };
type IdentityFile = { kind: "identity"; contest: string; rows: [string | null, string, string | null][] };
type Player = {
  playerId: string;
  providerPlayerId?: string;
  teamId: string;
  positionGroup: string;
  fixtureCount?: number;
  expectedMinutes?: number;
  startProbability?: number;
  isStarter?: boolean;
  price?: number;
  age?: number;
  confidence?: number;
  component?: Record<string, unknown>;
  stats?: Record<string, number | null>;
  recentFp?: number[];
  roundPoints?: number;
  predictedFp?: number;
  alternativeRoundPoints?: number;
  alternativePredictedFp?: number;
  opp?: number;
  altOpp?: number;
  calculated?: string;
  dataUpdated?: string;
};
type Round = {
  kind: "round";
  contest: string;
  league: string;
  season: string;
  key: string;
  round: number;
  captured: string;
  deadline: string;
  firstKickoff: string;
  finished: string;
  fixtures: Fixture[];
  players: Player[];
};
type Row = {
  input: ResearchFixtureInput;
  target: number;
  minutes: number;
  goals: number;
  assists: number;
  listed: boolean;
  fo: number;
  alt: number | null;
  opp: number | null;
  altOpp: number | null;
  player: Player;
};

const identities = new Map<string, { provider: Map<string, string | null>; internal: Map<string, string | null> }>();
const official = new Map<string, ScoreFile>();
const fingerprints = await Promise.all([fileHash(roundPath), fileHash(scorePath)]);
await Promise.all([
  readLines<Round | IdentityFile>(roundPath, (data) => {
    if (data.kind !== "identity") return;
    const provider = new Map<string, string | null>();
    const internal = new Map<string, string | null>();
    for (const [providerId, statId, coreId] of data.rows) {
      if (providerId) putUnique(provider, providerId, statId);
      if (coreId) putUnique(internal, coreId, statId);
    }
    identities.set(data.contest, { provider, internal });
  }),
  readLines<ScoreFile>(scorePath, (data) => {
    const key = data.season + ":" + data.id;
    if (official.has(key)) throw new Error("Duplicate official fixture " + key);
    official.set(key, data);
  })
]);

const coverage = {
  rounds: 0, discardedRounds: 0, snapshotRows: 0, duplicatePlayers: 0, unverifiedTimestamp: 0, wrongIdentity: 0,
  otherClub: 0, wrongCalendar: 0, double: 0, blanks: 0, noComponent: 0, noFo: 0, rows: 0,
  uniqueRounds: {} as Record<string, number>
};
const stats = new Map<string, { xtx: number[][]; xty: number[]; rows: number }>();
const groups = new Map<string, Map<string, Metric>>();
const dates: Record<Phase, string[]> = { train: [], selection: [], holdout: [] };
const leagueRounds: Partial<Record<Phase, Record<string, number[]>>> = {};
const timeOf = (date: string | undefined) => date ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(date) ? date : date + "Z") : NaN;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const roundScore = (value: number) => Math.round(value * 100) / 100;
let ridge: ResearchRidge | undefined;
let lastDeadline = -Infinity;

await readLines<Round | IdentityFile>(roundPath, async (data) => {
  if (data.kind !== "round") return;
  const deadline = timeOf(data.deadline);
  if (deadline < lastDeadline) throw new Error("Round export must be chronological");
  lastDeadline = deadline;
  const phase = deadline < selectionStart ? "train" : deadline < holdoutStart ? "selection" : "holdout";
  const evaluationCutoff = phase === "train" ? selectionStart : phase === "selection" ? holdoutStart : cutoff;
  const finished = timeOf(data.finished);
  const captured = timeOf(data.captured);
  coverage.rounds++;
  coverage.snapshotRows += data.players.length;
  if (!(captured < Math.min(deadline, timeOf(data.firstKickoff))) ||
      !(finished + 3 * day < evaluationCutoff) || !data.fixtures?.length) {
    coverage.discardedRounds++;
    return;
  }

  const rows = roundRows(data, deadline);
  if (rows.length === 0) {
    coverage.discardedRounds++;
    return;
  }
  coverage.uniqueRounds[phase] = (coverage.uniqueRounds[phase] ?? 0) + 1;
  dates[phase].push(data.deadline.slice(0, 10));
  const perLeague = (leagueRounds[phase] ??= {});
  (perLeague[data.league] ??= []).push(data.round);
  coverage.rows += rows.length;
  if (fivePlusTraining && fivePlusHistory) {
    const fixtures = new Map<string, ReturnType<typeof fivePlusFixtureFeatures>>();
    for (const [, home, away, kickoff, status, , , matchId] of data.fixtures) {
      if (status !== "CLOSED") continue;
      for (const [teamId, opponentTeamId, side] of [[home, away, "H"], [away, home, "A"]] as const) {
        fixtures.set(teamId, fivePlusFixtureFeatures({ teamId, opponentTeamId, side, matchId, kickoffAt: new Date(timeOf(kickoff)) }, captured, fivePlusHistory));
      }
    }
    for (const { player, input, target, alt, fo } of rows) {
      const fixture = fixtures.get(player.teamId);
      if (!fixture) throw new Error("No archived fixture for a training row");
      const old = squadResearchForecasts.map(({ id }) => researchFixturePoints(id, input, sportsRuResearchRidge)!);
      const line = JSON.stringify([phase, data.league + ":" + data.round, target, fo, alt, old,
        fivePlusPlayerFeatures(input, { age: player.age, price: player.price, confidence: player.confidence, starter: player.isStarter }),
        fixture.player(player.playerId), fixture.team, fixture.opponent, deadline, finished]) + "\n";
      if (!fivePlusTraining.write(line)) await once(fivePlusTraining, "drain");
    }
  }
  if (phase === "train") {
    for (const row of rows) {
      const features = researchRidgeFeatures(row.input);
      for (const position of ["ALL", row.input.position]) updateFit(position, features, row.target);
    }
    return;
  }
  ridge ??= fitRidge();
  scoreRound(phase, data.league, rows, ridge);
});
if (fivePlusTraining) {
  fivePlusTraining.end();
  await once(fivePlusTraining, "finish");
}

if (!ridge || phases.some((phase) => dates[phase].length === 0)) throw new Error("Insufficient chronological coverage");
const results = Object.fromEntries([...groups].map(([key, values]) => [
  key, Object.fromEntries([...values].map(([label, metric]) => [label, metric.result()]))
]));
// Rank on selection RMSE only. Deduplicate near-identical formulas by family.
// Holdout is a final comparison; it is never used in fitting or ranking.
const families = {
  form: "form", rules: "rules", minuteStates: "minutes", minuteHistory: "minutes",
  shrunkXA: "rates", hybridRates: "rates", blendForm: "blend", blendMinutes: "blend",
  ridge: "ridge", ridgeGlobal: "ridge"
} satisfies Record<ResearchStudyCandidate, string>;
const validation = groups.get("selection:all")!;
const selected: ResearchStudyCandidate[] = [];
const used = new Set<string>();
const baselineRmse = validation.get("FO")!.rmse();
for (const name of [...researchStudyCandidates].sort((a, b) => validation.get(a)!.rmse() - validation.get(b)!.rmse())) {
  // Do not promote a close copy of FO that only changes the step arithmetic.
  if (used.has(families[name]) || !(validation.get(name)!.rmse() < baselineRmse)) continue;
  used.add(families[name]);
  selected.push(name);
  if (selected.length === 5) break;
}
process.stdout.write(JSON.stringify({
  asOf: cutoffArg, sha256: fingerprints, officialFixtures: official.size, coverage, leagueRounds,
  dateRanges: Object.fromEntries(phases.map((p) => [p, [dates[p][0], dates[p].at(-1)]])),
  selected, ridge, results, maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024)
}, null, 2) + "\n");

function roundRows(data: Round, deadline: number): Row[] {
  const teams = new Map<string, Array<Map<string, Official> | null>>();
  const officialTeamByPlayer = new Map<string, string>();
  for (const [id, home, away, kickoff, status, mapping, finished] of data.fixtures) {
    if (status !== "CLOSED") continue; // provider excludes left-over postponed games
    if (mapping !== "MATCHED" || !finished || !(timeOf(kickoff) >= deadline) || !home || !away) return [];
    const score = official.get(data.season + ":" + id);
    for (const [team, side] of [[home, score?.home], [away, score?.away]] as const) {
      const matches = teams.get(team) ?? [];
      matches.push(side ? new Map(side.map((r) => [r[0], r])) : null);
      teams.set(team, matches);
      for (const row of side ?? []) putUnique(officialTeamByPlayer, row[0], team);
    }
  }
  const ids = identities.get(data.contest);
  if (!ids) return [];
  const counts = new Map<string, number>();
  for (const p of data.players) counts.set(p.playerId, (counts.get(p.playerId) ?? 0) + 1);
  const used = new Set<string>();
  const rows: Row[] = [];
  for (const p of data.players) {
    if (counts.get(p.playerId) !== 1) { coverage.duplicatePlayers++; continue; }
    if (!(timeOf(p.calculated) < deadline) || timeOf(p.dataUpdated) >= deadline) {
      coverage.unverifiedTimestamp++;
      continue;
    }
    const providerId = p.providerPlayerId ? ids.provider.get(p.providerPlayerId) : undefined;
    const internalId = ids.internal.get(p.playerId);
    const id = providerId ?? (!p.providerPlayerId ? internalId : undefined);
    if (!id || (internalId && internalId !== id) || used.has(id)) { coverage.wrongIdentity++; continue; }
    used.add(id);
    const teamFixtures = teams.get(p.teamId) ?? [];
    if (p.fixtureCount !== teamFixtures.length) { coverage.wrongCalendar++; continue; }
    if (teamFixtures.length === 0) { coverage.blanks++; continue; }
    if (teamFixtures.length !== 1) { coverage.double++; continue; }
    const fixture = teamFixtures[0];
    if (!fixture) { coverage.wrongCalendar++; continue; }
    const factTeam = officialTeamByPlayer.get(id);
    if (factTeam !== undefined && factTeam !== p.teamId) { coverage.otherClub++; continue; }
    const fact = fixture.get(id);
    const input = researchFixtureInput(p.positionGroup, p.expectedMinutes, p.startProbability, p.component, p.stats, p.recentFp);
    if (!input) { coverage.noComponent++; continue; }
    const fo = p.roundPoints ?? p.predictedFp;
    if (!finite(fo)) { coverage.noFo++; continue; }
    rows.push({
      input, target: fact?.[1] ?? 0, minutes: fact?.[2] ?? 0, goals: fact?.[3] ?? 0,
      assists: fact?.[4] ?? 0, listed: !!fact, fo,
      alt: finite(p.alternativeRoundPoints) ? p.alternativeRoundPoints : null,
      opp: p.opp ?? null, altOpp: p.altOpp ?? null, player: p
    });
  }
  return rows;
}

function scoreRound(phase: Phase, league: string, rows: Row[], model: ResearchRidge) {
  const predictions = rows.map((row) => {
    const values: Record<string, number | null> = { FO: row.fo, ALT: row.alt, FO_OPP: row.opp, ALT_OPP: row.altOpp };
    for (const name of researchStudyCandidates) {
      const score = researchFixturePoints(name, row.input, model);
      values[name] = score === null ? null : roundScore(score);
    }
    return { row, values };
  });
  type Predictions = typeof predictions;
  const withoutAlt = ["FO", ...researchStudyCandidates] as const;
  const compare = (name: string, sample: Predictions, keys: readonly string[] = withoutAlt) => {
    // Fixed, paired player universe for every candidate within this cohort.
    const complete = sample.filter(({ values }) => keys.every((key) => finite(values[key])));
    if (!complete.length) return;
    const groupKey = phase + ":" + name;
    const group = groups.get(groupKey) ?? new Map();
    const truth = complete.map(({ row }) => row.target);
    for (const key of keys) {
      const metric = group.get(key) ?? new Metric();
      metric.addRound(truth, complete.map(({ values }) => values[key]!));
      group.set(key, metric);
    }
    groups.set(groupKey, group);
  };
  compare("all", predictions);
  compare("altPaired", predictions, [...withoutAlt, "ALT"]);
  if (phase === "holdout") {
    compare("oppPaired", predictions, [...withoutAlt, "ALT", "FO_OPP", "ALT_OPP"]);
    compare("league:" + league, predictions);
    compare("listed", predictions.filter(({ row }) => row.listed));
    compare("played", predictions.filter(({ row }) => row.minutes > 0));
    compare("likely", predictions.filter(({ row }) => row.input.appearance >= 0.65 && row.input.minutes >= 45));
    for (const pos of ["GK", "DEF", "MID", "FWD"]) {
      compare("position:" + pos, predictions.filter(({ row }) => row.input.position === pos));
    }
  }
}

function putUnique(map: Map<string, string | null>, key: string, value: string) {
  map.set(key, map.has(key) && map.get(key) !== value ? null : value);
}

function updateFit(key: string, x: number[], actual: number) {
  const m = x.length;
  const state = stats.get(key) ?? { xtx: Array.from({ length: m }, () => Array<number>(m).fill(0)), xty: Array<number>(m).fill(0), rows: 0 };
  for (let i = 0; i < m; i++) {
    state.xty[i] += x[i] * actual;
    for (let j = 0; j < m; j++) state.xtx[i][j] += x[i] * x[j];
  }
  state.rows++;
  stats.set(key, state);
}

function fitRidge(): ResearchRidge {
  const fit: Record<string, number[]> = {};
  for (const [key, { xtx, xty, rows }] of stats) {
    if (rows < 200) continue;
    const m = xty.length;
    const penalty = Math.max(35, rows * 0.006);
    const a = xtx.map((row, i) => [...row.map((v, j) => v + (i === j && i > 0 ? penalty : 0)), xty[i]]);
    for (let col = 0; col < m; col++) {
      let pivot = col;
      for (let i = col + 1; i < m; i++) if (Math.abs(a[i][col]) > Math.abs(a[pivot][col])) pivot = i;
      [a[col], a[pivot]] = [a[pivot], a[col]];
      const v = a[col][col];
      if (Math.abs(v) < 1e-10) throw new Error("Ill-conditioned model at " + key);
      for (let j = col; j <= m; j++) a[col][j] /= v;
      for (let i = 0; i < m; i++) {
        if (i === col) continue;
        const factor = a[i][col];
        for (let j = col; j <= m; j++) a[i][j] -= factor * a[col][j];
      }
    }
    fit[key] = a.map((r) => Number(r[m].toFixed(8)));
  }
  return fit;
}

async function readLines<T>(path: string, visit: (data: T) => void | Promise<void>) {
  const source = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of source) if (line.trim()) await visit(JSON.parse(line) as T);
}

async function fileHash(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function sortedIndexes(values: number[], descending = false) {
  return values.map((_, i) => i).sort((a, b) => (descending ? values[b] - values[a] : values[a] - values[b]) || a - b);
}

function ranks(values: number[]) {
  const order = sortedIndexes(values);
  const rank = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i + 1;
    while (j < order.length && values[order[j]] === values[order[i]]) j++;
    for (let k = i; k < j; k++) rank[order[k]] = (i + j - 1) / 2;
    i = j;
  }
  return rank;
}

function spearman(actual: number[], predicted: number[]) {
  const a = ranks(actual), b = ranks(predicted), mean = (a.length - 1) / 2;
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - mean, y = b[i] - mean;
    xy += x * y;
    xx += x * x;
    yy += y * y;
  }
  return xx && yy ? xy / Math.sqrt(xx * yy) : null;
}
