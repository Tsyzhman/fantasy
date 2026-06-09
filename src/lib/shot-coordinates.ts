export const FOTMOB_PITCH_LENGTH_METERS = 105;
export const FOTMOB_PITCH_WIDTH_METERS = 68;

// match_shots.normalized_* values are stored as 0-100 pitch percentages.
export function normalize_fotmob_pitch_coordinates(x: number | null | undefined, y: number | null | undefined): [number | null, number | null] {
  return [normalize_fotmob_pitch_axis_coordinate(x, FOTMOB_PITCH_LENGTH_METERS), normalize_fotmob_pitch_axis_coordinate(y, FOTMOB_PITCH_WIDTH_METERS)];
}

export function normalized_shot_axis_coordinate(normalizedValue: number | null | undefined, rawValue: number | null | undefined, axisLength: number) {
  const normalizedPercent = normalized_percent_coordinate(normalizedValue);
  if (normalizedPercent !== null) return normalizedPercent;
  return normalize_fotmob_pitch_axis_coordinate(rawValue, axisLength);
}

export function normalized_percent_coordinate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value * 100;
  return value;
}

function normalize_fotmob_pitch_axis_coordinate(value: number | null | undefined, axisLength: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value * 100;
  if (value >= 0 && value <= axisLength) return (value / axisLength) * 100;
  return value;
}
