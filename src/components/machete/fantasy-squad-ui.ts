export type FixtureChipSide = "home" | "away" | null;

export type FixtureChipPresentation = {
  label: string;
  title: string;
  side: FixtureChipSide;
  difficulty: number | null | undefined;
};

const surnameParticles = new Set(["al", "bin", "da", "das", "de", "del", "della", "den", "der", "di", "dos", "du", "la", "le", "van", "von"]);

export function compactSquadPlayerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? name;

  let surnameStart = parts.length - 1;
  while (surnameStart > 1 && surnameParticles.has(parts[surnameStart - 1].toLocaleLowerCase())) {
    surnameStart -= 1;
  }
  const initial = Array.from(parts[0].replace(/[.]+$/g, ""))[0]?.toLocaleUpperCase();
  return initial ? `${initial}. ${parts.slice(surnameStart).join(" ")}` : name;
}

export function fixtureChipPresentations(
  fixtures: string[],
  difficulties: Array<number | null | undefined>,
  horizon: number
): FixtureChipPresentation[] {
  return fixtures.slice(0, horizon).flatMap((roundLabel, roundIndex) =>
    roundLabel
      .split(/\s*,\s*/)
      .map((label) => fixtureChipPresentation(label, difficulties[roundIndex]))
      .filter((fixture): fixture is FixtureChipPresentation => fixture !== null)
  );
}

function fixtureChipPresentation(rawLabel: string, difficulty: number | null | undefined): FixtureChipPresentation | null {
  const title = rawLabel.trim();
  if (!title) return null;

  const leadingSide = title.match(/^([HA])\s+(.+)$/i);
  if (leadingSide) {
    return {
      label: leadingSide[2].trim(),
      title,
      side: leadingSide[1].toUpperCase() === "H" ? "home" : "away",
      difficulty
    };
  }

  const trailingSide = title.match(/^(.+?)\s*\(([HA])\)$/i);
  if (trailingSide) {
    return {
      label: trailingSide[1].trim(),
      title,
      side: trailingSide[2].toUpperCase() === "H" ? "home" : "away",
      difficulty
    };
  }

  return { label: title, title, side: null, difficulty };
}
