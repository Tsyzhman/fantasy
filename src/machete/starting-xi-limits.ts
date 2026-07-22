import { normalizeFantasyPosition } from "@/machete/squad_logic";

export const STARTING_XI_SIZE = 11;
export const STARTING_XI_GOALKEEPERS = 1;
export const STARTING_XI_OUTFIELD_PLAYERS = 10;

export type StartingXiLimitCode =
  | "STARTING_XI_LIMIT"
  | "STARTING_XI_GOALKEEPER_LIMIT"
  | "STARTING_XI_OUTFIELD_LIMIT";

type StartingXiPlayer = {
  isStarter?: boolean | null;
  position?: string | null;
};

export function startingXiSelectionBlockReason(
  roster: ReadonlyArray<StartingXiPlayer>,
  candidate: StartingXiPlayer
): StartingXiLimitCode | null {
  if (candidate.isStarter) return null;

  const starters = roster.filter((player) => player.isStarter);
  if (starters.length >= STARTING_XI_SIZE) return "STARTING_XI_LIMIT";

  const candidateIsGoalkeeper = normalizeFantasyPosition(candidate.position) === "GK";
  const goalkeeperCount = starters.filter((player) => normalizeFantasyPosition(player.position) === "GK").length;
  const outfieldCount = starters.length - goalkeeperCount;

  if (candidateIsGoalkeeper && goalkeeperCount >= STARTING_XI_GOALKEEPERS) {
    return "STARTING_XI_GOALKEEPER_LIMIT";
  }
  if (!candidateIsGoalkeeper && outfieldCount >= STARTING_XI_OUTFIELD_PLAYERS) {
    return "STARTING_XI_OUTFIELD_LIMIT";
  }
  return null;
}
