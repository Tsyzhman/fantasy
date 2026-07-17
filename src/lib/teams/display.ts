export type CompactTeamDisplayInput = {
  name?: unknown;
  shortName?: unknown;
  metadata?: unknown;
};

/**
 * Returns the provider-owned short team name without inventing an abbreviation.
 * Explicit provider data wins over season metadata; malformed values are ignored.
 */
export function providerTeamShortName(input: Pick<CompactTeamDisplayInput, "shortName" | "metadata">) {
  return displayText(input.shortName) ?? metadataDisplayText(input.metadata, "short_name") ?? metadataDisplayText(input.metadata, "shortName");
}

/**
 * Compact UI label: provider short name first, canonical full name as fallback.
 * React still escapes the returned text at render time; this helper additionally
 * removes control whitespace so provider payloads cannot break compact layout.
 */
export function compactTeamDisplayName(input: CompactTeamDisplayInput) {
  return providerTeamShortName(input) ?? displayText(input.name);
}

function metadataDisplayText(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return displayText((metadata as Record<string, unknown>)[key]);
}

function displayText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || null;
}
