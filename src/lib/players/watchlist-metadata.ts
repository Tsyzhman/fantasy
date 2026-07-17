import { providerTeamShortName } from "@/lib/teams/display";

const teamShortNameKey = "teamShortName";

export function watchlistMetadataWithTeamShortName(metadata: unknown, shortName: unknown) {
  const existing = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  const normalizedShortName = providerTeamShortName({ shortName });
  return normalizedShortName ? { ...existing, [teamShortNameKey]: normalizedShortName } : existing;
}

export function watchlistTeamShortName(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return providerTeamShortName({ shortName: (metadata as Record<string, unknown>)[teamShortNameKey] });
}
