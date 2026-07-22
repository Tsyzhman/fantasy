export const NULL_GLYPH = "—";

export function formatDate(value?: Date | string | null) {
  if (!value) return NULL_GLYPH;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return NULL_GLYPH;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function formatDateTime(value?: Date | string | null) {
  if (!value) return NULL_GLYPH;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return NULL_GLYPH;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Moscow"
  }).format(date);
}

export function formatNumber(value?: number | null, maximumFractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return NULL_GLYPH;
  return new Intl.NumberFormat("en", { maximumFractionDigits }).format(value);
}

export function formatScore(value?: number | null) {
  return formatNumber(value, 2);
}

export function formatAlternativeScore(value?: number | null) {
  return formatScore(value ?? 0);
}

export function formatCompactScore(value?: number | null, missingValue = NULL_GLYPH) {
  if (value === null || value === undefined || !Number.isFinite(value)) return missingValue;
  return formatNumber(value, Math.abs(value) < 10 ? 1 : 0);
}

export function formatCurrency(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return NULL_GLYPH;
  if (value >= 1_000_000) return `EUR ${formatNumber(value / 1_000_000, 1)}m`;
  if (value >= 1_000) return `EUR ${formatNumber(value / 1_000, 0)}k`;
  return `EUR ${formatNumber(value, 0)}`;
}
