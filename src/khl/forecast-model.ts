/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#forecast */
import { scoreMatch, type ScoreInput } from "./scoring";

export interface ForecastState { probability: number; score: ScoreInput; participates: boolean }
/** States retain joint outcome/TOI/SV/GA dependence. No second multiplication by P(start). */
export function projectJointStates(input: { states: ForecastState[]; modelVersion: string; rulesVersion: string; asOf: number; inputAvailableAt: number[]; xgReady: boolean }) {
  const unknown = (reason: string) => ({ ep: null, variance: null, breakdown: {}, appearanceProbability: null, modelVersion: input.modelVersion, rulesVersion: input.rulesVersion, warnings: [reason] });
  if (!input.states.length || input.states.length > 10000 || input.states.some(s => !Number.isFinite(s.probability) || s.probability < 0) || Math.abs(input.states.reduce((n, s) => n + s.probability, 0) - 1) > 1e-6) return unknown("DISTRIBUTION_INVALID");
  if (input.inputAvailableAt.some(at => !Number.isFinite(at) || at > input.asOf)) return unknown("FUTURE_INPUT");
  const breakdown: Record<string, number> = {};
  let ep = 0, secondMoment = 0, appearanceProbability = 0;
  for (const state of input.states) {
    if (!state.probability || !state.participates) continue;
    const score = scoreMatch(state.score);
    if (score.total === null) return unknown(score.warnings[0] ?? "SCORING_INPUT_INCOMPLETE");
    appearanceProbability += state.probability;
    ep += state.probability * score.total;
    secondMoment += state.probability * score.total ** 2;
    for (const [key, value] of Object.entries(score.breakdown)) breakdown[key] = (breakdown[key] ?? 0) + state.probability * value!;
  }
  return { ep, variance: Math.max(0, secondMoment - ep ** 2), breakdown, appearanceProbability, modelVersion: input.modelVersion, rulesVersion: input.rulesVersion, warnings: ["SCORING_PROVISIONAL", ...(!input.xgReady ? ["XG_UNAVAILABLE"] : [])] };
}

export function intervalPlanEp(input: { owned: string[]; steps: { out: string; in: string; at: number }[]; games: { playerId: string; matchId: string; startsAt: number; ep: number | null; status: string }[]; asOf: number; horizonEnd: number }) {
  if (input.steps.some((s, i) => s.at < input.asOf || s.at >= input.horizonEnd || i > 0 && s.at < input.steps[i - 1].at)) throw new Error("PLAN_TIME_INVALID");
  const holdings = new Set(input.owned);
  for (const step of input.steps) { if (!holdings.has(step.out) || holdings.has(step.in)) throw new Error("PLAN_HOLDING_INVALID"); holdings.delete(step.out); holdings.add(step.in); }
  let baseline = 0, planned = 0;
  const keys = new Set<string>();
  for (const game of input.games) {
    if (game.status !== "SCHEDULED" || game.startsAt <= input.asOf || game.startsAt >= input.horizonEnd) continue;
    const key = `${game.playerId}:${game.matchId}`;
    if (keys.has(key)) throw new Error("DUPLICATE_FORECAST"); keys.add(key);
    let owned = input.owned.includes(game.playerId);
    for (const step of input.steps) {
      if (step.at > game.startsAt) break;
      if (step.out === game.playerId) owned = false;
      if (step.in === game.playerId) owned = true;
    }
    if (game.ep === null && (owned || input.owned.includes(game.playerId))) return { baseline: null, planned: null, gain: null, reason: "FORECAST_INCOMPLETE" };
    if (input.owned.includes(game.playerId)) baseline += game.ep ?? 0;
    if (owned) planned += game.ep ?? 0;
  }
  return { baseline, planned, gain: planned - baseline, reason: null };
}

export function evaluateForecasts(rows: { position: "G" | "D" | "F"; predicted: number; baseline: number; actual: number; startProbability?: number; started?: boolean }[]) {
  const byPosition = Object.fromEntries((["G", "D", "F"] as const).map(pos => {
    const subset = rows.filter(r => r.position === pos);
    const mean = (f: (r: typeof rows[number]) => number) => subset.length ? subset.reduce((n, r) => n + f(r), 0) / subset.length : null;
    return [pos, { count: subset.length, mae: mean(r => Math.abs(r.predicted - r.actual)), baselineMae: mean(r => Math.abs(r.baseline - r.actual)) }];
  }));
  const goalie = rows.filter(r => r.startProbability !== undefined && r.started !== undefined);
  return { byPosition, goalieCount: goalie.length, brier: goalie.length ? goalie.reduce((n, r) => n + (r.startProbability! - Number(r.started)) ** 2, 0) / goalie.length : null };
}
