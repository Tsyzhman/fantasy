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

export function positionEventPriorPer90(
  position: Exclude<FantasyPositionGroup, "UNK">,
  event: "goals" | "assists"
) {
  return POSITION_EVENT_PRIORS[position][event] * 90 / ASSUMED_MINUTES_PER_APPEARANCE;
}

export type ArchivedRateBlendInput = {
  position: Exclude<FantasyPositionGroup, "UNK">;
  event: "goals" | "assists";
  currentRatePer90: number;
  currentMinutes: number;
  currentEvents: number;
  priorAppearances: number;
  priorMinutes: number | null;
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
  const currentRatePer90 = input.currentMinutes > 0
    ? Math.max(0, input.currentRatePer90)
    : Math.max(0, input.currentEvents) * 90 / ASSUMED_MINUTES_PER_APPEARANCE;
  const priorRatePer90 = (
    input.priorMinutes !== null && input.priorMinutes > 0
      ? Math.max(0, input.priorEvents) * 90 / input.priorMinutes
      : Math.max(0, input.priorEvents / input.priorAppearances) * 90 / ASSUMED_MINUTES_PER_APPEARANCE
  ) * clamp(input.tierFactor, 0, 1);
  const positionRatePer90 = positionEventPriorPer90(input.position, input.event);
  const denominator = currentAppearances + effectivePriorAppearances + positionPriorAppearances;
  const ratePer90 = denominator > 0
    ? (
        currentAppearances * currentRatePer90 +
        effectivePriorAppearances * priorRatePer90 +
        positionPriorAppearances * positionRatePer90
      ) / denominator
    : 0;
  return {
    ratePer90,
    fade,
    effectivePriorAppearances,
    positionPriorAppearances
  };
}

export function archivedExpectedMinutes(input: {
  existingMinutes: number;
  priorAppearances: number;
  priorMinutes?: number | null;
  priorTeamMatches: number;
  currentTeamStatMatches: number;
  detailedClubHistoryMatches?: number;
  sameTeam: boolean;
}) {
  if ((input.detailedClubHistoryMatches ?? 0) >= 5) return input.existingMinutes;
  if (input.priorAppearances <= 0 || input.priorTeamMatches <= 0) return input.existingMinutes;
  const appearanceRate = clamp(input.priorAppearances / input.priorTeamMatches, 0, 1);
  const coverageFade = clamp(1 - input.currentTeamStatMatches / ARCHIVE_MINUTES_FADE_TEAM_MATCHES, 0, 1);
  const transferFactor = input.sameTeam ? 1 : 0.9;
  const priorMinutesPerTeamMatch = typeof input.priorMinutes === "number" && Number.isFinite(input.priorMinutes)
    ? Math.max(0, input.priorMinutes) / input.priorTeamMatches
    : ASSUMED_MINUTES_PER_APPEARANCE * appearanceRate;
  const archiveMinutes = priorMinutesPerTeamMatch * coverageFade * transferFactor;
  return Math.max(input.existingMinutes, archiveMinutes);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
