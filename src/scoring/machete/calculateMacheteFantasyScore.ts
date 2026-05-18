export type MacheteFantasyScoreInput = {
  minutes?: number | null;
  goals?: number | null;
  assists?: number | null;
  shotsOnTarget?: number | null;
  keyPasses?: number | null;
  tackles?: number | null;
  interceptions?: number | null;
  saves?: number | null;
  averageRating?: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
};

export function calculateMacheteFantasyScore(input: MacheteFantasyScoreInput) {
  const score =
    value(input.minutes) * 0.02 +
    value(input.goals) * 5 +
    value(input.assists) * 4 +
    value(input.shotsOnTarget) * 0.7 +
    value(input.keyPasses) * 0.8 +
    value(input.tackles) * 0.3 +
    value(input.interceptions) * 0.3 +
    value(input.saves) * 0.4 +
    value(input.averageRating) * 2 -
    value(input.yellowCards) * 1 -
    value(input.redCards) * 3;

  return Number(score.toFixed(2));
}

function value(input?: number | null) {
  return typeof input === "number" && Number.isFinite(input) ? input : 0;
}
