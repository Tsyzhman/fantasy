export type FixtureChipSide = "home" | "away" | null;

export type FixtureChipPresentation = {
  label: string;
  title: string;
  side: FixtureChipSide;
  difficulty: number | null | undefined;
};

export function fixtureChipPresentations(
  fixtures: string[],
  difficulties: Array<number | null | undefined>,
  horizon: number,
  fixtureFullNames?: string[]
): FixtureChipPresentation[] {
  return fixtures.slice(0, horizon).flatMap((roundLabel, roundIndex) =>
    roundLabel
      .split(/\s*,\s*/)
      .map((label, fixtureIndex) => fixtureChipPresentation(
        label,
        difficulties[roundIndex],
        fixtureFullNames?.[roundIndex]?.split(/\s*,\s*/)[fixtureIndex]
      ))
      .filter((fixture): fixture is FixtureChipPresentation => fixture !== null)
  );
}

function fixtureChipPresentation(rawLabel: string, difficulty: number | null | undefined, rawTitle?: string): FixtureChipPresentation | null {
  const labelText = rawLabel.trim();
  if (!labelText) return null;
  const title = rawTitle?.trim() || labelText;

  const leadingSide = labelText.match(/^([HA])\s+(.+)$/i);
  if (leadingSide) {
    return {
      label: leadingSide[2].trim(),
      title,
      side: leadingSide[1].toUpperCase() === "H" ? "home" : "away",
      difficulty
    };
  }

  const trailingSide = labelText.match(/^(.+?)\s*\(([HA])\)$/i);
  if (trailingSide) {
    return {
      label: trailingSide[1].trim(),
      title,
      side: trailingSide[2].toUpperCase() === "H" ? "home" : "away",
      difficulty
    };
  }

  return { label: labelText, title, side: null, difficulty };
}
