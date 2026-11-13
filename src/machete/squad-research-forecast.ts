// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import { expectedPoissonGroups, type FantasyPosition, type PlayerFixtureProjection } from "./deterministic_fantasy_projection";
import { positionEventPriorPer90 } from "./player-season-prior";

export type ResearchForecastHistory = Readonly<Record<string, unknown>>;
export type ResearchFixtureInput = {
  position: FantasyPosition;
  minutes: number;
  appearance: number;
  sixty: number;
  full: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  conceded: number;
  saves: number;
  recoveries: number;
  yellow: number;
  red: number;
  history?: ResearchForecastHistory;
  recent?: readonly number[];
};

type State = { probability: number; minutes: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const mix = (base: number, extra: number, weight: number) => (1 - weight) * base + weight * extra;
const defensive = (position: FantasyPosition) => position === "GK" || position === "DEF";
const attacker = (position: FantasyPosition) => position === "MID" || position === "FWD";
const goalWeight = (position: FantasyPosition) => defensive(position) ? 6 : position === "MID" ? 5 : 4;
const cleanWeight = (position: FantasyPosition) => defensive(position) ? 4 : position === "MID" ? 1 : 0;

/** One-minute/sub-60/60+/full states. Keep probabilities nested when evidence is noisy. */
function minuteStates(input: ResearchFixtureInput, historyWeight: number): State[] {
  const observed = input.history?.matches_played;
  const historical = (key: string, fallback: number) => {
    const value = input.history?.[key];
    return isNumber(value) && isNumber(observed) && observed > 0
      ? mix(fallback, value, historyWeight * Math.min(1, observed / 5))
      : fallback;
  };
  const appearance = clamp(historical("appearance_probability", input.appearance), 0, 1);
  const sixty = clamp(historical("sixty_minute_probability", input.sixty), 0, appearance);
  const full = clamp(historical("full_match_probability", input.full), 0, sixty);
  return [
    { probability: appearance - sixty, minutes: 25 },
    { probability: sixty - full, minutes: 75 },
    { probability: full, minutes: 90 }
  ];
}

function stateAverage(states: readonly State[], fn: (minutes: number) => number) {
  return states.reduce((total, { probability, minutes }) => probability > 0 ? total + probability * fn(minutes) : total, 0);
}

function appearedPoints(input: ResearchFixtureInput) {
  return input.appearance + input.sixty + (attacker(input.position) ? input.full : 0);
}

function componentPoints(input: ResearchFixtureInput) {
  const pos = input.position;
  return appearedPoints(input) + goalWeight(pos) * input.goals + 3 * input.assists +
    cleanWeight(pos) * input.cleanSheets -
    (defensive(pos) ? expectedPoissonGroups(input.conceded, 2) : 0) +
    expectedPoissonGroups(pos === "GK" ? input.saves : input.recoveries, 3) -
    input.yellow - 3 * input.red;
}

function statePoints(input: ResearchFixtureInput, historyWeight: number, shortenCleanSheet: boolean) {
  const { position: pos, sixty, cleanSheets, conceded, recoveries, saves, yellow, red } = input;
  const states = minuteStates(input, historyWeight);
  const exposure = stateAverage(states, (minutes) => minutes) / 90;
  // Rates refer to the original forecast's expected playing time. The cap
  // prevents division by a tiny expected exposure for sparsely used players.
  const originalExposure = Math.max(input.minutes / 90, 0.2);
  const exposureRatio = clamp(exposure / originalExposure, 0, 1.5);
  const cleanAt90 = sixty > 0 ? clamp(cleanSheets / sixty, 0, 1)
    : defensive(pos) && conceded > 0 ? Math.exp(-conceded / originalExposure) : 0.24;
  const defence = stateAverage(states, (minutes) => {
    const share = minutes / 90;
    const clean = minutes >= 60 ? cleanWeight(pos) * cleanAt90 ** (shortenCleanSheet ? share : 1) : 0;
    const concededPoints = defensive(pos) ? expectedPoissonGroups(conceded * share / originalExposure, 2) : 0;
    const stepPoints = expectedPoissonGroups((pos === "GK" ? saves : recoveries) * share / originalExposure, 3);
    return clean + stepPoints - concededPoints;
  });
  const appearance = stateAverage(states, (minutes) => 1 + (minutes >= 60 ? 1 : 0) + (minutes === 90 && attacker(pos) ? 1 : 0));
  return appearance + defence + exposureRatio * (goalWeight(pos) * input.goals + 3 * input.assists - yellow - 3 * red);
}

function smoothedRate(
  input: ResearchFixtureInput, event: "goals" | "assists", priorMinutes: number, observedWeight: number
) {
  const minutes = input.history?.minutes_played;
  const expected = input.history?.[event === "goals" ? "xg" : "xa"];
  const actual = input.history?.[event];
  const prior = positionEventPriorPer90(input.position, event);
  if (!isNumber(minutes) || minutes <= 0 || !isNumber(expected)) return prior;
  const total = isNumber(actual) ? mix(expected, actual, observedWeight) : expected;
  return (90 * Math.max(0, total) + priorMinutes * prior) / (minutes + priorMinutes);
}

function ratePoints(input: ResearchFixtureInput, priorMinutes: number, observedWeight: number, assistFactor: number) {
  const pos = input.position;
  const xg = smoothedRate(input, "goals", priorMinutes, observedWeight) * input.minutes / 90;
  const xa = smoothedRate(input, "assists", priorMinutes, observedWeight) * input.minutes / 90;
  const goals = mix(input.goals, xg, 0.45);
  const assists = mix(input.assists, xa, 0.45) * assistFactor;
  return componentPoints(input) + goalWeight(pos) * (goals - input.goals) + 3 * (assists - input.assists);
}

function formPoints(input: ResearchFixtureInput) {
  const recent = (input.recent ?? []).filter(isNumber).slice(-5);
  if (recent.length === 0) return null;
  const weighted = recent.reduce((total, points, i) => total + (i + 1) * points, 0);
  return weighted / (recent.length * (recent.length + 1) / 2);
}

export const researchStudyCandidates = [
  "form", "rules", "minuteStates", "minuteHistory", "shrunkXA", "hybridRates", "blendForm", "blendMinutes", "ridge", "ridgeGlobal"
] as const;
export type ResearchStudyCandidate = typeof researchStudyCandidates[number];

export type ResearchRidge = Partial<Record<FantasyPosition | "ALL", readonly number[]>>;

export function researchRidgeFeatures(input: ResearchFixtureInput): number[] {
  const pos = input.position;
  const recent = formPoints(input);
  const historicalAppearance = input.history?.appearance_probability;
  const historicalSixty = input.history?.sixty_minute_probability;
  return [
    1,
    input.minutes / 90, input.appearance, input.sixty, attacker(pos) ? input.full : 0,
    goalWeight(pos) * input.goals / 3, 3 * input.assists / 2, cleanWeight(pos) * input.cleanSheets / 3,
    expectedPoissonGroups(pos === "GK" ? input.saves : input.recoveries, 3) / 2,
    defensive(pos) ? expectedPoissonGroups(input.conceded, 2) : 0,
    input.yellow + 3 * input.red,
    (recent ?? componentPoints(input)) / 4,
    isNumber(historicalAppearance) ? historicalAppearance : input.appearance,
    isNumber(historicalSixty) ? historicalSixty : input.sixty
  ];
}

export function researchFixturePoints(
  candidate: ResearchStudyCandidate, input: ResearchFixtureInput, ridge?: ResearchRidge
): number | null {
  if (candidate === "form") return formPoints(input);
  if (candidate === "rules") return componentPoints(input);
  if (candidate === "minuteStates") return statePoints(input, 0, true);
  if (candidate === "minuteHistory") return statePoints(input, 0.35, true);
  if (candidate === "shrunkXA") return ratePoints(input, 450, 0, 1.1);
  if (candidate === "hybridRates") return ratePoints(input, 270, 0.25, 1.15);
  if (candidate === "blendForm") return mix(ratePoints(input, 450, 0, 1.1), formPoints(input) ?? componentPoints(input), 0.30);
  if (candidate === "blendMinutes") return mix(statePoints(input, 0.35, true), ratePoints(input, 270, 0.25, 1.15), 0.50);
  const coefficients = ridge?.[candidate === "ridgeGlobal" ? "ALL" : input.position];
  if (!coefficients) return null;
  const features = researchRidgeFeatures(input);
  if (coefficients.length !== features.length) return null;
  // An extreme out-of-range linear prediction is not useful for display.
  return clamp(features.reduce((sum, value, i) => sum + value * coefficients[i], 0), -4, 18);
}

export function researchFixtureInputFromProjection(
  position: string, projection: PlayerFixtureProjection | undefined,
  history: ResearchForecastHistory | undefined, recent: readonly number[] | undefined
) {
  if (!projection) return null;
  const p = projection.probabilities;
  const e = projection.expectedEvents;
  return researchFixtureInput(position, projection.expectedMinutes, p.appearance, {
    sixtyMinutesProbability: p.sixtyMinutes, fullMatchProbability: p.fullMatch,
    expectedGoals: e.goals, expectedAssists: e.assists, expectedCleanSheets: e.cleanSheets,
    expectedGoalsConceded: e.goalsConceded, expectedSaves: e.saves, expectedRecoveries: e.recoveries,
    expectedYellowCards: e.yellowCards, expectedRedCards: e.redCards
  }, history, recent);
}

export function researchFixtureInput(
  position: string,
  minutes: unknown,
  appearance: unknown,
  components: Readonly<Record<string, unknown>> | null | undefined,
  history: ResearchForecastHistory | undefined,
  recent: readonly number[] | undefined
): ResearchFixtureInput | null {
  if (position !== "GK" && position !== "DEF" && position !== "MID" && position !== "FWD") return null;
  if (!isNumber(minutes) || minutes < 0 || minutes > 90 || !isNumber(appearance) || !components) return null;
  const {
    sixtyMinutesProbability: sixty, fullMatchProbability: full,
    expectedGoals: goals, expectedAssists: assists, expectedCleanSheets: cleanSheets,
    expectedGoalsConceded: conceded, expectedSaves: saves, expectedRecoveries: recoveries,
    expectedYellowCards: yellow, expectedRedCards: red
  } = components;
  if (!isNumber(sixty) || !isNumber(full) || !isNumber(goals) || !isNumber(assists) ||
      !isNumber(cleanSheets) || !isNumber(conceded) || !isNumber(saves) ||
      !isNumber(recoveries) || !isNumber(yellow) || !isNumber(red)) return null;
  if (appearance < 0 || appearance > 1 || sixty < 0 || sixty > appearance || full < 0 || full > sixty ||
      cleanSheets < 0 || cleanSheets > sixty || Math.min(goals, assists, conceded, saves, recoveries, yellow, red) < 0) return null;
  return { position, minutes, appearance, sixty, full, goals, assists, cleanSheets, conceded, saves, recoveries, yellow, red, history, recent };
}
