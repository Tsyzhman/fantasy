export type ShotSituationFilter = "all" | "open_play" | "set_piece" | "penalty";

export function shotMatchesSituationFilter(value: string | null | undefined, filter: ShotSituationFilter) {
  if (filter === "all") return true;
  return classifyShotSituation(value) === filter;
}

export function classifyShotSituation(value: string | null | undefined): Exclude<ShotSituationFilter, "all"> {
  const normalized = (value ?? "").toLowerCase().replace(/[\s_-]+/g, "");

  if (normalized.includes("penalty")) return "penalty";
  if (
    normalized.includes("setpiece") ||
    normalized.includes("corner") ||
    normalized.includes("freekick") ||
    normalized.includes("throwin")
  ) {
    return "set_piece";
  }

  return "open_play";
}
