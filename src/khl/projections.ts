/** @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#forecast */
export function expectedSavePoints(distribution: { saves: number; probability: number }[]) {
  if (!distribution.length || distribution.some(x => !Number.isInteger(x.saves) || x.saves < 0 || !Number.isFinite(x.probability) || x.probability < 0) || Math.abs(distribution.reduce((n, x) => n + x.probability, 0) - 1) > 1e-6) return null;
  return distribution.reduce((sum, x) => sum + Math.floor(x.saves / 2) * x.probability, 0);
}
export function goalieStartDistribution(candidates: { id: string; weight: number; confirmed: boolean }[]) {
  if (new Set(candidates.map(p => p.id)).size !== candidates.length || candidates.some(p => !Number.isFinite(p.weight) || p.weight < 0) || candidates.filter(p => p.confirmed).length > 1) return null;
  const confirmed = candidates.find(p => p.confirmed);
  const sum = candidates.reduce((n, p) => n + p.weight, 0);
  return { players: candidates.map(p => ({ id: p.id, probability: confirmed ? Number(p === confirmed) : sum ? p.weight / sum : 0, quality: confirmed ? "FACT" : "ESTIMATE" })), unknownOther: confirmed || sum ? 0 : 1 };
}
export function baselineProjection(input: { history: { fp: number | null; availableAt: number }[]; fixtures: { startsAt: number; status: string }[]; asOf: number; calendarComplete: boolean }) {
  const history = input.history.filter(h => h.availableAt <= input.asOf && h.fp !== null && Number.isFinite(h.fp)).slice(-10);
  const games = input.fixtures.filter(f => f.status === "SCHEDULED" && f.startsAt > input.asOf).length;
  return { ep: input.calendarComplete && history.length ? history.reduce((n, h) => n + h.fp!, 0) / history.length * games : null, quality: "ESTIMATE", modelVersion: "khl-fp10-baseline-v1", warnings: ["BETA_BASELINE", "XG_UNAVAILABLE", ...(!input.calendarComplete ? ["CALENDAR_INCOMPLETE"] : [])], sampleSize: history.length };
}
