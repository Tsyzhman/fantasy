// Kept only to migrate saved preferences and read older rotating snapshots.
// The research models are no longer imported by the application.
export const retiredFantasyForecastKeys = [
  "foPositionCalibratedFp",
  "altPositionCalibratedFp",
  "altJointAllFp",
  "foJointAllFp",
  "altJointAcceptedFp",
  "foJointAcceptedFp"
] as const;

type RetiredFantasyForecastKey = typeof retiredFantasyForecastKeys[number];
const retiredKeys = new Set<string>(retiredFantasyForecastKeys);

export function isRetiredFantasyForecastKey(key: unknown): key is RetiredFantasyForecastKey {
  return typeof key === "string" && retiredKeys.has(key);
}

export function withoutRetiredFantasyForecasts<T extends object>(value: T): Omit<T, RetiredFantasyForecastKey> {
  if (!retiredFantasyForecastKeys.some((key) => Object.hasOwn(value, key))) return value;
  const compact = { ...value } as T & Partial<Record<RetiredFantasyForecastKey, unknown>>;
  for (const key of retiredFantasyForecastKeys) delete compact[key];
  return compact;
}
