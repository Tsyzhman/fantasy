const surnameParticles = new Set([
  "al", "bin", "da", "das", "de", "del", "della", "den", "der", "di", "dos", "du", "la", "le", "van", "von",
  "аль", "бин", "да", "дас", "де", "дель", "делла", "ден", "дер", "ди", "дос", "дю", "ла", "ле", "ван", "фон"
]);

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
export function firstKnownPlayerName(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const name = candidate?.trim();
    if (name && !/^FotMob player\s/i.test(name)) return name;
  }
  return "";
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#player-identity */
export function playerPoolExportName(player: { name: string; fotmobName?: string | null }) {
  return firstKnownPlayerName(player.name, player.fotmobName);
}

export function compactPlayerDisplayName(name: string) {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? trimmed;

  let surnameStart = parts.length - 1;
  while (surnameStart > 1 && surnameParticles.has(parts[surnameStart - 1].replace(/[.]+$/g, "").toLocaleLowerCase())) {
    surnameStart -= 1;
  }
  const initial = Array.from(parts[0].replace(/[.]+$/g, ""))[0]?.toLocaleUpperCase();
  return initial ? `${initial}. ${parts.slice(surnameStart).join(" ")}` : trimmed;
}
