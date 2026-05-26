export function finiteNumberQueryParam(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
