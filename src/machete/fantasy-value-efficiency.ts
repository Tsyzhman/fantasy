export function forecastPointsPerPrice(
  points: number | null | undefined,
  price: number | null | undefined
) {
  if (typeof points !== "number" || !Number.isFinite(points)) return null;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  return Math.round(points / price * 10_000) / 10_000;
}
