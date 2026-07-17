const surnameParticles = new Set(["al", "bin", "da", "das", "de", "del", "della", "den", "der", "di", "dos", "du", "la", "le", "van", "von"]);

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
