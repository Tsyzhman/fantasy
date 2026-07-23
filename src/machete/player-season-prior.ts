import type { FantasyPositionGroup } from "./squad_logic";

const ASSUMED_MINUTES_PER_APPEARANCE = 70;
const MAX_PRIOR_APPEARANCES = 12;
const POSITION_PRIOR_APPEARANCES = 4;
const PRIOR_FADE_MINUTES = 900;
const ARCHIVE_MINUTES_FADE_TEAM_MATCHES = 8;
export const FNL_TO_RPL_EVENT_FACTOR = 0.78;

const POSITION_EVENT_PRIORS: Record<Exclude<FantasyPositionGroup, "UNK">, { goals: number; assists: number }> = {
  GK: { goals: 0.003, assists: 0.002 },
  DEF: { goals: 0.035, assists: 0.04 },
  MID: { goals: 0.105, assists: 0.1 },
  FWD: { goals: 0.22, assists: 0.08 }
};

export type ArchivedRateBlendInput = {
  position: Exclude<FantasyPositionGroup, "UNK">;
  event: "goals" | "assists";
  currentRatePer90: number;
  currentMinutes: number;
  currentEvents: number;
  priorAppearances: number;
  priorEvents: number | null;
  tierFactor: number;
};

export type ArchivedRateBlend = {
  ratePer90: number;
  fade: number;
  effectivePriorAppearances: number;
  positionPriorAppearances: number;
};

export function blendArchivedEventRate(input: ArchivedRateBlendInput): ArchivedRateBlend | null {
  if (input.priorAppearances <= 0 || input.priorEvents === null) return null;
  const fade = clamp(1 - input.currentMinutes / PRIOR_FADE_MINUTES, 0, 1);
  if (fade === 0) {
    return {
      ratePer90: Math.max(0, input.currentRatePer90),
      fade,
      effectivePriorAppearances: 0,
      positionPriorAppearances: 0
    };
  }
  const effectivePriorAppearances = Math.min(input.priorAppearances, MAX_PRIOR_APPEARANCES) * fade;
  const positionPriorAppearances = POSITION_PRIOR_APPEARANCES * fade;
  const currentAppearances = Math.max(0, input.currentMinutes) / ASSUMED_MINUTES_PER_APPEARANCE;
  const currentEventEquivalent =
    input.currentMinutes > 0
      ? Math.max(0, input.currentRatePer90) * input.currentMinutes / 90
      : Math.max(0, input.currentEvents);
  const priorRate = Math.max(0, input.priorEvents / input.priorAppearances) * clamp(input.tierFactor, 0, 1);
  const positionRate = POSITION_EVENT_PRIORS[input.position][input.event];
  const denominator = currentAppearances + effectivePriorAppearances + positionPriorAppearances;
  const ratePerAppearance = denominator > 0
    ? (
        currentEventEquivalent +
        effectivePriorAppearances * priorRate +
        positionPriorAppearances * positionRate
      ) / denominator
    : 0;
  return {
    ratePer90: ratePerAppearance * 90 / ASSUMED_MINUTES_PER_APPEARANCE,
    fade,
    effectivePriorAppearances,
    positionPriorAppearances
  };
}

export function archivedExpectedMinutes(input: {
  existingMinutes: number;
  priorAppearances: number;
  priorTeamMatches: number;
  currentTeamStatMatches: number;
  sameTeam: boolean;
}) {
  if (input.priorAppearances <= 0 || input.priorTeamMatches <= 0) return input.existingMinutes;
  const appearanceRate = clamp(input.priorAppearances / input.priorTeamMatches, 0, 1);
  const coverageFade = clamp(1 - input.currentTeamStatMatches / ARCHIVE_MINUTES_FADE_TEAM_MATCHES, 0, 1);
  const transferFactor = input.sameTeam ? 1 : 0.9;
  const archiveMinutes = ASSUMED_MINUTES_PER_APPEARANCE * appearanceRate * coverageFade * transferFactor;
  return Math.max(input.existingMinutes, archiveMinutes);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
